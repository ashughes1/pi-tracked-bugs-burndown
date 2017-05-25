;(exports => {
    "use strict";

    // https://www.mozilla.org/en-US/styleguide/identity/firefox/color/
    const FIREFOX_ORANGE = "#E66000";
    const FIREFOX_LIGHT_ORANGE = "#FF9500";
    const FIREFOX_YELLOW = "#FFCB00";
    const FIREFOX_BLUE = "#00539F";
    const FIREFOX_LIGHT_BLUE = "#0095DD";
    const FIREFOX_LIGHT_BLUE_GREY1 = "#EAEFF2";
    const FIREFOX_LIGHT_BLUE_GREY2 = "#D4DDE4";
    const FIREFOX_DARK_BLUE_GREY1 = "#424F5A";
    const FIREFOX_DARK_BLUE_GREY2 = "#6A7B86";

    const SHUMWAY_M2 = 1044759;
    const SHUMWAY_M3 = 1037568;
    const SHUMWAY_M4 = 1037580;
    const SHUMWAY_1_0 = 1038057;

    const MS_PER_DAY = 24*60*60*1000;
    const MS_PER_WEEK = 7*MS_PER_DAY;
    const MS_PER_MONTH = 4*MS_PER_WEEK;

    const DEBUG = true;
    function debug(...args) { DEBUG && console.debug(...args); }

    function days(d) { return d * MS_PER_DAY; }
    function weeks(w) { return days(7 * w); }
    function months(m) { return weeks(4 * m); }

    const CHART_START_PERIOD = months(3);
    const CHART_END_PERIOD = months(3);

    const todaysDate = new Date();
    const currentTime = todaysDate.valueOf();
    const E10S_START_DATE = Date.parse("2014-09-11");
    const FIX_RATE_PERIOD = weeks(4);
    const FIX_RATE_START_DATE = 0 ? E10S_START_DATE : (currentTime - FIX_RATE_PERIOD);

    const queryString = parseQueryString();

    function parseQueryString() {
        // e.g. "?foo=bar&baz=qux&/"
        let qs = window.location.search;
        if (qs.length <= 1) {
            return {};
        }

        const slash = (qs[qs.length - 1] === '/') ? -1 : undefined;
        qs = qs.slice(1, slash);

        const kvs = {};

        const params = qs.split("&");
        _.forEach(params, kv => {
            kv = kv.split("=", 2);
            const key = kv[0].toLowerCase();
            if (key.length === 0) {
                return; // "&&"
            }
            const value = (kv.length > 1) ? decodeURIComponent(kv[1]) : null;
            kvs[key] = value;
        });
        return kvs;
    }

    function getElementValue(id) {
        return document.getElementById(id).value;
    }

    function daysFromHours(hours) {
        return Math.ceil(hours / 8);
    }

    function weeksFromHours(hours) {
        return Math.ceil(daysFromHours(hours) / 5);
    }

    function calendarDaysFromWorkDays(workDays) {
        const workWeeks = workDays / 5;
        const modWorkDays = workDays % 5;
        return workWeeks * 7 + modWorkDays;
    }

    function yyyy_mm_dd(date) {
        return date.toISOString().slice(0,10);
    }

    function makeLinearRegressionFunction(xys) {
        const line = ss.linear_regression().data(xys).line();
        return x => {
            const y = line(x);
            if (y <= 0) {
                return 0;
            }
            return Math.ceil(y);
        };
    }

    function drawOpenClosed(data) {
        const columns = [
            ["x"].concat(data.dates),
            ["open"].concat(data.open),
            ["closed"].concat(data.closed),
        ];
        if (data.days) {
            columns.push(["days"].concat(data.days));
        }
        c3.generate({
            data: {
                x: "x",
                columns: columns,
                names: {
                    days: "Days Remaining",
                    open: "Open Bugs",
                    closed: "Closed Bugs",
                },
                types: {
                    days: "line",
                    open: "area",
                    closed: "area",
                },
                colors: {
                    days: FIREFOX_BLUE,
                    open: "#00C",
                    closed: "#090",
                },
                groups: [["open", "closed"]],
                order: null,
            },
            axis: {
                x: {
                    type: "timeseries",
                    tick: {
                        format: "%Y-%m-%d",
                    }
                }
            },
        });
    }

    function createElement(tag, child) {
        const element = document.createElement(tag);
        if (typeof child !== "undefined") {
            if (typeof child !== "object") {
                child = document.createTextNode(child.toString());
            }
            element.appendChild(child);
        }
        return element;
    }

    function createLink(text, url) {
        const element = createElement("a", text);
        element.setAttribute("href", url);
        return element;
    }

    function searchAndPlotBugs(searchTerms) {
        const t0 = Date.now();
        debug("searchAndPlotBugs: " + searchTerms);

        $bugzilla.searchBugs(searchTerms, (error, bugs) => {
            const t1 = Date.now();
            debug("searchAndPlotBugs: " + (t1 - t0) + " ms");
            if (error) {
                console.error("searchBugs: " + error);
                return;
            }

            if (bugs.length === 0) {
                console.info("searchBugs: zarro boogs");
                return;
            }

            let changes = {};

            function getChange(date) {
                date = yyyy_mm_dd(date);
                let change = changes[date];
                if (!change) {
                    change = {date: date, bugsOpened: [], bugsClosed: []};
                    changes[date] = change;
                }
                return change;
            }

            const bugList = document.getElementById("bugs");
            let listURL = `https://bugzilla.mozilla.org/buglist.cgi?bug_id=`;

            _.forEach(bugs, bug => {
                if (bug.open) {
                    const bugURL = $bugzilla.makeURL(bug.id);
                    //debug("Bug " + bug.id + " " + bug.summary, bugURL);

                    const bugRow = createElement("div");
                    bugRow.appendChild(createLink("bug " + bug.id + " - " + bug.summary, bugURL));
                    bugList.appendChild(bugRow);
                    listURL += `${bug.id},`;
                }

                getChange(bug.reportedAt).bugsOpened.push(bug);

                if (!bug.open) {
                    // XXX pretend last change time is time of resolution
                    getChange(bug.lastModifiedAt).bugsClosed.push(bug);
                }
            });


            bugList.appendChild(createLink("Open bug list in Bugzilla", listURL));

            const bugDates = [];
            const openBugCounts = [];
            const closedBugCounts = [];
            const remainingDays = [];

            let runningOpenBugCount = 0;
            let runningClosedBugCount = 0;
            let runningRemainingDays = 0;

            changes = _.sortBy(changes, "date");

            const chartStartDate = queryString.since || yyyy_mm_dd(new Date(Date.now() - CHART_START_PERIOD));
            let hasTimeTracking = false;

            _.forEach(changes, change => {
                const closedBugCountDelta = change.bugsClosed.length;
                const openBugCountDelta = change.bugsOpened.length - closedBugCountDelta;

                const daysOpened = daysFromHours(_.reduce(change.bugsOpened, (sum, bug) => {
                    const t = bug.timeTracking;
                    if (!t) {
                        return sum;
                    }
                    hasTimeTracking = true;
                    return sum + t.currentEstimate;
                }, 0));

                const daysClosed = daysFromHours(_.reduce(change.bugsClosed, (sum, bug) => {
                    const t = bug.timeTracking;
                    if (!t) {
                        return sum;
                    }
                    hasTimeTracking = true;
                    return sum + t.currentEstimate;
                }, 0));

                runningOpenBugCount += openBugCountDelta;
                runningClosedBugCount += closedBugCountDelta;
                runningRemainingDays += daysOpened - daysClosed;

                if (change.date >= chartStartDate) {
                    bugDates.push(change.date);
                    openBugCounts.push(runningOpenBugCount);
                    closedBugCounts.push(runningClosedBugCount);
                    remainingDays.push(runningRemainingDays);
                }
            });

            if (bugDates.length > 0) {
                // Extend earliest bug count to beginning of chart start date.
                if (bugDates[0] > chartStartDate) {
                    bugDates.unshift(chartStartDate);
                    openBugCounts.unshift(_.head(openBugCounts));
                    closedBugCounts.unshift(_.head(closedBugCounts));
                    remainingDays.unshift(_.head(remainingDays));
                }

                // Extend last bug count to today, so burndown ends on today.
                if (_.last(bugDates) < yyyy_mm_dd(todaysDate)) {
                    bugDates.push(yyyy_mm_dd(todaysDate));
                    openBugCounts.push(_.last(openBugCounts));
                    closedBugCounts.push(_.last(closedBugCounts));
                    remainingDays.push(_.last(remainingDays));
                }
            }

/*
            const bugCountInputs = [];
            const remainingDaysInputs = [];

            let i = bugDates.length - 1;
            for (;;) {
                if (i < 0) {
                   break;
                }
                const t = Date.parse(bugDates[i]);
                if (t < FIX_RATE_START_DATE) {
                    break;
                }
                bugCountInputs.unshift([t, closedBugCounts[i]]);
                remainingDaysInputs.unshift([t, remainingDays[i]]);
                i--;
            }

            // fix rate:
            const firstBugCountInput = bugCountInputs[0];
            const lastBugCountInput = _.last(bugCountInputs);
            const dt = (lastBugCountInput[0] - firstBugCountInput[0]) / MS_PER_DAY;
            const db = lastBugCountInput[1] - firstBugCountInput[1];
            debug("velocity: "+db+" bugs / "+dt+" days = "+(db/dt)+" bugs closed per day");

            const predictRemainingDays = makeLinearRegressionFunction(remainingDaysInputs);
            const averageFixRate = db / dt;
// */

/*
            const E10S_VELOCITY = 2.5; // bugs closed per day from 09-14 through 11–14
            const SHUMWAY_VELOCITY = 1;

            const predictedFixRate = SHUMWAY_VELOCITY;
            debug("velocity: "+predictedFixRate+" bugs closed per day");

            const chartEndDate = currentTime + CHART_END_PERIOD;
            let futureDate = currentTime;
            let futureOpenBugCount = _.last(openBugCounts);
            const futureTotalBugCount = futureOpenBugCount + _.last(closedBugCounts);

            for (;;) {
                futureDate += MS_PER_DAY;
                if (futureDate > chartEndDate) {
                    break;
                }

                futureOpenBugCount = Math.max(futureOpenBugCount - predictedFixRate, 0);
                if (futureOpenBugCount <= 0) {
                    bugDates.push(yyyy_mm_dd(new Date(futureDate)));
                    openBugCounts.push(futureOpenBugCount);
                    closedBugCounts.push(futureTotalBugCount - futureOpenBugCount);
                    if (hasTimeTracking) {
                        let futureRemainingDays = predictRemainingDays(futureDate);
                        remainingDays.push(futureRemainingDays);
                    }
                    break;
                }
            }

            // If time-tracking estimate exceeds bug velocity estimate, keep drawing.
            if (hasTimeTracking) {
                for (;;) {
                    futureDate += MS_PER_DAY;
                    if (futureDate > chartEndDate) {
                        break;
                    }

                    let futureRemainingDays = predictRemainingDays(futureDate);
                    if (futureRemainingDays === 0) {
                        bugDates.push(yyyy_mm_dd(new Date(futureDate)));
                        openBugCounts.push(0);
                        remainingDays.push(futureRemainingDays);
                        break;
                    }
                }
            }
// */

            drawOpenClosed({
                dates: bugDates,
                open: openBugCounts,
                closed: closedBugCounts,
                days: (hasTimeTracking ? remainingDays : null),
            });
        });
    }

    function login(username, password) {
        $bugzilla.login(username, password, (error, response) => {
            if (error) {
                console.error("login: " + error);
                alert(error);
                return;
            }
            searchAndPlotBugs(["cf_tracking_e10s", tracking_e10s]);
        });
    }

/*
    const username = document.getElementById("username");
    if (queryString.username) {
        username.value = queryString.username;
    }

    const password = document.getElementById("password");
    if (queryString.password) {
        password.value = queryString.password;
    }

    const button = document.getElementById("button");
    button.focus();
    button.addEventListener("click", () => {
        const username = getElementValue("username");
        const password = getElementValue("password");
        tracking_e10s = getElementValue("bug");
        if (username && password) {
            login(username, password);
        } else {
            searchAndPlotBugs(["cf_tracking_e10s", tracking_e10s]);
        }
    });
// */

    const searchTerms = [];

    const component = queryString.component;
    if (component) {
        const components = component.split(",");
        for (let component of components) {
            searchTerms.push([$bugzilla.field.COMPONENT, component]);
        }
    }

    const whiteboard = queryString.whiteboard;
    if (whiteboard) {
        searchTerms.push([$bugzilla.field.WHITEBOARD, whiteboard]);
    }

    const tracking_e10s = queryString["tracking-e10s"];
    if (tracking_e10s) {
        const milestones = tracking_e10s.split(",");
        milestones.forEach(milestone => {
            searchTerms.push(["cf_tracking_e10s", milestone]);
        });
    }
   
    const blocks = queryString.bug || queryString.blocks;
    if (blocks) {
        // FIXME: extract split/push helper function
        const blockedBugs = blocks.split(",");
        for (let blockingBug of blockedBugs) {
            searchTerms.push([$bugzilla.field.BLOCKS, blockingBug]);
        }
    }
    
    const tracking_fx55 = queryString.cf_tracking_firefox55;
    if (tracking_fx55) {
        searchTerms.push(["cf_tracking_firefox55", tracking_fx55]);
    }

    searchAndPlotBugs(searchTerms);

    const searchValues = [];
    for (let [key, value] of searchTerms) {
        searchValues.push(value);
    }
    document.title = "Burndown: " + searchValues.join(", ");
})(this);
