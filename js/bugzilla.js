;(exports => {
    "use strict";

    const bzClient = bz.createClient({
        username: "",
        password: "",
    });

    const DEBUG = true;
    function debug(s) { DEBUG && console.debug(s); }

    function xhr(url, callback) {
        function onError(event) {
            console.error(event.type);
            request.removeEventListener("error", onError);
            request.removeEventListener("load", onLoad);
            callback(event, null);
        }

        function onLoad(event) {
            debug("onLoad: " + request.responseText);
            request.removeEventListener("error", onError);
            request.removeEventListener("load", onLoad);
            const response = JSON.parse(request.responseText);
            callback(null, response);
        }

        const request = new XMLHttpRequest();
        request.addEventListener("error", onError);
        request.addEventListener("load", onLoad);
        request.open("GET", url, true);
        request.setRequestHeader("Accept", "application/json");
        request.send();
    }

    function getStoryPoints(bug) {
        // TODO: check for Points flag or p=# whiteboard tag
        const hours = bug.estimated_time;
        if (hours <= .5) {
            return .5;
        }
        const days = hours / 8;
        let f1 = 1;
        let f2 = 1;
        while (f1 < days) {
            const fn = f1 + f2;
            f1 = f2;
            f2 = fn;
        }
        return f1;
    }

    function matchRealName(detail) {
        // "Joe Cool (:joe :joecool)"
        return detail.real_name.match(/\s*(.+)\s+[([]:(\S+).*[)\]]\s*/);
    }

    function getAssignedToName(detail) {
        const match = matchRealName(detail);
        return (match && match.length >= 2) ? match[1] : "";
    }

    function getAssignedToNick(detail) {
        const match = matchRealName(detail);
        return (match && match.length >= 3) ? match[2] : null;
    }

    function materializePerson(detail) {
        return {
            name: getAssignedToName(detail),
            nick: getAssignedToNick(detail),
            email: detail.email,
        };
    }

    function materializeTimeTracking(bug) {
        if (typeof bug.estimated_time === "undefined") {
            return null; // no time tracking data
        }
        const currentEstimate = bug.actual_time + bug.remaining_time;
        return {
            originalEstimate: bug.estimated_time,
            currentEstimate: currentEstimate,
            remainingHours: bug.remaining_time,
            storyPoints: getStoryPoints(bug),
        };
    }

    function materializeBlockingFlags(bug) {
        // "cf_blocking_b2g" : "---",
        // "cf_blocking_fennec" : "---",
        // "cf_blocking_fennec10" : "+",
        // "cf_blocking_fx" : "---",
        const cf_blocking_ = "cf_blocking_";
        const cf_blocking_len = cf_blocking_.length;
        return _.reduce(bug, (blockingFlags, value, key) => {
            if (value !== "---" && key.startsWith(cf_blocking_)) {
                key = key.slice(cf_blocking_len);
                blockingFlags[key] = value;
            }
            return blockingFlags;
        }, {});
    }

    function materializeStatusFlags(bug) {
        // "cf_status_b2g_2_1" : "---",
        // "cf_status_firefox30" : "unaffected",
        // "cf_status_firefox31" : "affected",
        // "cf_status_firefox32" : "fixed",
        const cf_status_ = "cf_status_";
        const cf_status_len = cf_status_.length;
        return _.reduce(bug, (statusFlags, value, key) => {
            if (value !== "---" && key.startsWith(cf_status_)) {
                key = key.slice(cf_status_len);
                statusFlags[key] = value;
            }
            return statusFlags;
        }, {});
    }

    function materializeTrackingFlags(bug) {
        // "cf_tracking_b2g_v1_3" : "---",
        // "cf_tracking_e10s" : "later",
        // "cf_tracking_firefox30" : "+",
        const cf_tracking_ = "cf_tracking_";
        const cf_tracking_len = cf_tracking_.length;
        return _.reduce(bug, (trackingFlags, value, key) => {
            if (value !== "---" && key.startsWith(cf_tracking_)) {
                key = key.slice(cf_tracking_len);
                trackingFlags[key] = value;
            }
            return trackingFlags;
        }, {});
    }

    function materializeBug(bug) {
        return {
            /*
            assignedTo: materializePerson(bug.assigned_to_detail),
            blockingFlags: materializeBlockingFlags(bug),
            blocks: bug.blocks,
            component: bug.component,
            dependsOn: bug.depends_on,
            dupeOf: bug.dupe_of,
            */
            id: bug.id,
            summary: bug.summary,
            //keywords: bug.keywords,
            open: bug.is_open,
            //os: bug.op_sys,
            //product: bug.product,
            reportedAt: new Date(bug.creation_time),
            lastModifiedAt: new Date(bug.last_change_time),
            /*
            reporter: materializePerson(bug.creator_detail),
            resolution: bug.resolution,
            summary: bug.summary,
            status: bug.status,
            statusFlags: materializeStatusFlags(bug),
            timeTracking: materializeTimeTracking(bug),
            trackingFlags: materializeTrackingFlags(bug),
            whiteboard: bug.whiteboard, // TODO: parse whiteboard tags?
            */
            _XXX: bug, // escape hatch to original bug object
        };
    }

    function searchBugs(searchTerms, callback) {
        let url = [BUGZILLA_URL, "bug?"];
        for (let [key, value] of searchTerms) {
            url.push("&", encodeURIComponent(key), "=", encodeURIComponent(value));
        }
        if (loginToken) {
            url.push("&token=", loginToken);
        }

        // Must use exclude_fields because we can't include_fields all cf_status_* or cf_tracking_* flags by name.
        //url.push("&exclude_fields=alias,cc,cf_crash_signature,cf_qa_whiteboard,cf_user_story,classification,flags,groups,is_cc_accessible,is_confirmed,is_creator_accessible,platform,priority,qa_contact,see_also,severity,target_milestone,url,version");
        url.push("&include_fields=id,summary,is_open,creation_time,last_change_time");

        url = url.join("");
        xhr(url, (error, response) => {
            if (error) {
                callback(error, null);
            } else {
                const bugs = _.map(response.bugs, materializeBug);
                callback(null, bugs);
            }
        });
    }

    const BUGZILLA_URL = "https://bugzilla.mozilla.org/rest/";
    const loginToken = null;

    exports.$bugzilla = {
        login(username, password, callback) {
            username = encodeURIComponent(username);
            password = encodeURIComponent(password);
            xhr(BUGZILLA_URL + "login?login=" + username + "&password=" + password,
                (error, response) => {
                    error = error || (response.error && response.message);
                    if (error) {
                        callback(error, null);
                    } else {
                        loginToken = encodeURIComponent(response.token);
                        callback(null, response);
                    }
                });
        },
        searchBugs: searchBugs,
        getBugs(bugIDs, callback) {
            const searchTerms = _.reduce(bugIDs, (searchTerms, bugID) => {
                searchTerms.push($bugz.field.ID, bugID);
                return searchTerms;
            }, []);
            searchBugs(searchTerms, callback);
        },
        getBug(bugID, callback) {
            $bugz.getBugs([bugID], (error, bugs) => {
                const bug = bugs ? bugs[0] : null;
                callback(error, bug);
            });
        },
        getBugComments(bugID, callback) {
            let url = BUGZILLA_URL + "bug/" + bugID + "/comment";
            if (loginToken) {
                url += "?token=" + loginToken;
            }
            url += "&include_fields=creator,time,raw_text";
            xhr(url, (error, response) => {
                if (error) {
                    callback(error, null);
                } else {
                    const comments = _.map(response.bugs[bugID].comments, (comments, value) => {
                        return {
                            commenter: value.creator,
                            time: new Date(value.time),
                            text: value.raw_text,
                        };
                    });
                    debug(comments);
                    //callback(error, comments);
                }
            });
        },
        getBugHistory(bugID, callback) {
            let url = BUGZILLA_URL + "bug/" + bugID + "/history";
            if (loginToken) {
                url += "?token=" + loginToken;
            }
            //url += "&include_fields=creator,time,raw_text";
            xhr(url, (error, response) => {
                if (error) {
                    callback(error, null);
                } else {
                    const comments = _.map(response.bugs[bugID].comments, (comments, value) => {
                        return {
                            commenter: value.creator,
                            time: new Date(value.time),
                            text: value.raw_text,
                        };
                    });
                    debug(comments);
                    //callback(error, comments);
                }
            });
        },
        makeURL(bugID) {
            return "https://bugzilla.mozilla.org/show_bug.cgi?id=" + bugID;
        },
        status: {
            ASSIGNED: "ASSIGNED",
            NEW: "NEW",
            REOPENED: "REOPENED",
            RESOLVED: "RESOLVED",
            UNCONFIRMED: "UNCONFIRMED",
            VERIFIED: "VERIFIED",
        },
        resolution: {
            // null?
            DUPLICATE: "DUPLICATE",
            FIXED: "FIXED",
            INCOMPLETE: "INCOMPLETE",
            INVALID: "INVALID",
            WONTFIX: "WONTFIX",
            WORKSFORME: "WORKSFORME",
        },
        field: {
            ASSIGNEE: "assigned_to",
            BLOCKS: "blocks",
            COMPONENT: "component",
            DEPENDS_ON: "deponds_on",
            HOURS_LEFT: "remaining_time",
            HOURS_WORKED: "actual_time",
            ID: "id",
            KEYWORDS: "keywords",
            ORIGINAL_ESTIMATE: "estimated_time",
            PRODUCT: "product",
            REPORTED: "creation_time",
            REPORTER: "creator",
            RESOLUTION: "resolution",
            STATUS: "status",
            SUMMARY: "summary",
            WHITEBOARD: "whiteboard",
        },
    };
})(this);
