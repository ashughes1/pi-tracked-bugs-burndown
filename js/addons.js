;(exports => {
    "use strict";

    exports.$addons = {
        parseSpreadsheet(json, callback) {
            let bugURL;
            let compatible;
            const bugIDs = [];
            const bugToAddonMap = {};
            const rows = $gdata.parseSpreadsheet(json);

            const addons = _.map(rows, row => {
                // e.g. "bug: 1002880, reason: AMO #8, amourl: https://addons.mozilla.org/en-US/firefox/addon/wot-safe-browsing-tool"
                const name = row.title;
                const tier = +row.tier;
                const notes = row["notes"];

                bugURL = null;
                compatible = null;
                let bug = row["bug"];
                if (typeof bug !== "undefined") {
                    bugURL = $bugz.makeURL(bug);
                    bug = +bug;
                    if (bug > 0) {
                        bugIDs.push(bug);
                    } else {
                        compatible = true;
                    }
                }

                let date = row["addondate"];
                if (date) {
                    date = Date.parse(date);
                }

                let amoURL = row["amourl"];
                if (!amoURL) {
                    //amoURL = "https://addons.mozilla.org/en-US/firefox/search/?q=" + name;
                    amoURL = "https://www.google.com/search?btnI=1&q=site%3Aaddons.mozilla.org+" + name;
                }

                const addon = {name:name, tier:tier, amoURL:amoURL, date:date, compatible:compatible, bug:bug, bugURL:bugURL, notes:notes};
                if (bug) {
                    bugToAddonMap[bug] = addon;
                }

                return addon;
            });

            const searchParams = {
                id: bugIDs,
                include_fields: "id, resolution",
            };

            $bugz.searchBugs(searchParams, (error, bugs) => {
                if (error) {
                    console.error(error);
                    alert(error);
                } else {
                    _.forEach(bugs, bug => {
                        const addon = bugToAddonMap[bug.id];
                        switch (bug.resolution) {
                            case $bugz.resolution.FIXED:
                            case $bugz.resolution.WORKSFORME:
                                addon.compatible = true;
                                break;
                            default:
                                console.error("Bug " + bug.id + " has unexpected resolution: " + bug.resolution);
                            case $bugz.resolution.DUPLICATE:
                            case $bugz.resolution.INVALID:
                            case $bugz.resolution.INCOMPLETE:
                            case $bugz.resolution.NONE:
                            case $bugz.resolution.WONTFIX:
                                addon.compatible = false;
                                break;
                        }
                    });
                }
                callback(error, addons);
            });
        }
    };
})(this);
