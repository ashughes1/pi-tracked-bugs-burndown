;(exports => {
    "use strict";

    exports.$index = {
        onSpreadsheet(json) {
            function createElement(tag, child) {
                const element = document.createElement(tag);
                if (typeof child !== "undefined") {
                    if (typeof child === "string") {
                        child = document.createTextNode(child);
                    }
                    element.appendChild(child);
                }
                return element;
            }

            function createLink(url, text) {
                const element = createElement("a", text);
                element.setAttribute("href", url);
                return element;
            }

            function shuffleArray(array) {
                for (let i = array.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    const temp = array[i];
                    array[i] = array[j];
                    array[j] = temp;
                }
                return array;
            }

            function sortByName(array) {
                array.sort((a, b) => {
                    return a.name < b.name ? -1 : (a.name === b.name ? 0 : 1);
                });
            }

            function createBugElement(addon) {
                if (addon.bug) {
                    const bugLink = createLink(addon.bugURL, "bug " + addon.bug);
                    if (addon.compatible) {
                        bugLink.setAttribute("style", "text-decoration:line-through");
                    }
                    return createElement("td", bugLink);
                }
                if (addon.bug === 0) {
                    return createElement("td", document.createTextNode("no bug"));
                }
                const bugzillaURL = 'https://bugzilla.mozilla.org/enter_bug.cgi?format=__default__&product=Firefox&component=Extension%20Compatibility&blocked=905436&keywords=addon-compat&short_desc="' + addon.name + '"%20add-on%20does%20not%20work%20with%20e10s&cc=cpeterson@mozilla.com&';
                const reportBugLink = createLink(bugzillaURL, "Report bug");

                const mailtoURL = 'mailto:cpeterson@mozilla.com?subject="' + addon.name + '" add-on works with e10s!&body=Add-on:%0A' + addon.name + '%0A%0AUser-Agent:%0A' + encodeURIComponent(navigator.userAgent);
                const itWorksLink = createLink(mailtoURL, 'it works');

                const td = createElement("td");
                td.appendChild(reportBugLink);
                td.appendChild(document.createTextNode(" or "));
                td.appendChild(itWorksLink);
                return td;
            }

            function appendAddonRows(tbody, addons) {
                const fragment = document.createDocumentFragment();
                _.forEach(addons, addon => {
                    let compatible, style;
                    if (addon.compatible) {
                        compatible = "compatible";
                        style = "success"; // green
                    } else if (addon.compatible === null) {
                        compatible = "not tested";
                        style = "warning"; // yellow
                    } else {
                        compatible = "bug reported";
                        style = "danger"; // red
                    }

                    const tr = document.createElement("tr");
                    tr.setAttribute("class", style);
                    tr.appendChild(createElement("td", createLink(addon.amoURL, decodeURIComponent(addon.name))));
                    tr.appendChild(createElement("td", compatible));
                    tr.appendChild(createBugElement(addon));
                    fragment.appendChild(tr);
                });
                tbody.appendChild(fragment);
            }

            $addons.parseSpreadsheet(json, (error, addons) => {
                const goodAddons = [];
                const untestedAddons = [];
                const badAddons = [];

                _.forEach(addons, addon => {
                    // Display all tier 1 addons, but only tier 2 and 3 addons that are known compatible or incompatible.
                    if (addon.tier > 2 && addon.compatible === null) {
                        return; // XXX
                    }

                    let array;
                    if (addon.compatible) {
                        array = goodAddons;
                    } else if (addon.compatible === null) {
                        array = untestedAddons;
                    } else {
                        array = badAddons;
                    }
                    array.push(addon);
                });

                sortByName(goodAddons);
                shuffleArray(untestedAddons);
                sortByName(badAddons);

                const tbody = document.getElementById("tbody");
                appendAddonRows(tbody, goodAddons);
                appendAddonRows(tbody, untestedAddons);
                appendAddonRows(tbody, badAddons);
            });
        }
    };
})(this);
