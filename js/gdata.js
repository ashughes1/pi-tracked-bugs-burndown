;(exports => {
    "use strict";

    exports.$gdata = {
        parseSpreadsheet(json) {
            const entries = json.feed.entry || [];
            return _.map(entries, entry => {
                // e.g. "tier: 1, bug: 1002880, reason: AMO #8, amourl: https://addons.mozilla.org/en-US/firefox/addon/wot-safe-browsing-tool"
                const title = (entry.title.type === "html") ? entry.title.$t : encodeURIComponent(entry.title.$t);
                const row = {title:title};
                const content = entry.content.$t.split(", ");

                _.forEach(content, column => {
                    const kv = column.split(": ");
                    row[kv[0]] = kv[1];
                });

                return row;
            });
        }
    };
})(this);
