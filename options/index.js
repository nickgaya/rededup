"use strict";

document.addEventListener("DOMContentLoaded", () => {
    const settingsDiv = document.getElementById('settingsDiv');
    const ddByUrlAndThumb = document.getElementById('ddByUrlAndThumb');
    const ddByUrlOnly = document.getElementById('ddByUrlOnly');
    const domainSettingsButton =
        document.getElementById('domainSettingsButton');
    const numDomains = document.getElementById('numDomains');
    const dctHash = document.getElementById('dctHash');
    const diffHash = document.getElementById('diffHash');
    const waveletHash = document.getElementById('waveletHash');
    const maxHammingDistance = document.getElementById('maxHammingDistance');
    const maxHammingDistanceText =
        document.getElementById('maxHammingDistanceText');
    const partitionByDomain = document.getElementById('partitionByDomain');
    const showHashValues = document.getElementById('showHashValues');
    const reset = document.getElementById('reset');

    const domainSettingsDiv = document.getElementById('domainSettingsDiv');
    const domainTable = document.getElementById('domainTable');
    const domainInputText = document.getElementById('domainInputText');
    const domainInputCheckbox = document.getElementById('domainInputCheckbox');
    const domainInputButton = document.getElementById('domainInputButton');
    const domainSettingsBack = document.getElementById('domainSettingsBack');

    const domainRegex = /^([a-zA-Z0-9-]{1,63}[.])*[a-zA-Z0-9-]{1,63}$/;

    function saveDomainSettings() {
        const domainSettingsLst = Array.from(domainTable.children, (row) => {
            const domain = row.children[0].textContent;
            const domainSettings = {
                deduplicateThumbs: row.children[1].children[0].checked,
            };
            return [domain, domainSettings];
        });
        numDomains.textContent = domainSettingsLst.length;
        browser.storage.local.set({domainSettings: domainSettingsLst});
    }

    /** Check that a domain name is valid. */
    function isValidDomain(domain) {
        return domain.length <= 255 && domainRegex.test(domain);
    }

    /** Normalize and validate a domain name. */
    function normalizeDomainName(domain) {
        if (domain == null) {
            return null;
        }
        domain = domain.trim();
        // If the user enters a URL, try to extract the hostname
        if (domain.includes('/') || domain.includes(':')) {
            try {
                domain = new URL(domain).hostname;
            } catch (error) {
                return null;
            }
        }
        if (domain.endsWith('.')) {
            domain = domain.slice(0, -1);
        }
        if (!isValidDomain(domain)) {
            return null;
        }
        domain = domain.toLowerCase();
        if (domain.startsWith('www.')) {
            domain = domain.slice(4);
        }
        return domain;
    }

    /** Get the sort key for a domain. */
    function domainSortKey(domain) {
        const labels = domain.split('.');
        if (!labels[labels.length - 1]) {
            labels.pop();
        }
        // Reverse domain labels so domains are collated hierarchically
        labels.reverse();
        return labels.join('.');
    }

    /** Create a row in the domain table. */
    function createDomainRow(domain, domainSettings) {
        const row = document.createElement('tr');
        row.dataset.sortKey = domainSortKey(domain);
        const cell1 = document.createElement('td');
        cell1.textContent = domain;
        row.append(cell1);
        const cell2 = document.createElement('td');
        const cbox = document.createElement('input');
        cbox.type = 'checkbox';
        cbox.checked = domainSettings.deduplicateThumbs;
        cbox.addEventListener('change', (event) => {
            saveDomainSettings();
        });
        cell2.append(cbox);
        row.append(cell2);
        const cell3 = document.createElement('td');
        const button = document.createElement('button');
        button.textContent = 'Remove';
        button.addEventListener('click', (event) => {
            domainTable.removeChild(row);
            saveDomainSettings();
        });
        cell3.append(button);
        row.append(cell3);
        return row;
    }

    /** Add a row to the domain table. */
    function addDomainRow(domain, domainSettings) {
        const normalizedDomain = normalizeDomainName(domain);
        if (!normalizedDomain) {
            return;
        }
        const row = createDomainRow(normalizedDomain, domainSettings);
        const rowSortKey = row.dataset.sortKey;
        for (const otherRow of Array.from(domainTable.children)) {
            const otherSortKey = otherRow.dataset.sortKey;
            if (otherSortKey === rowSortKey) {
                domainTable.replaceChild(row, otherRow);
                return;
            }
            if (otherSortKey.localeCompare(rowSortKey) > 0) {
                domainTable.insertBefore(row, otherRow);
                return;
            }
        }
        domainTable.appendChild(row);
    }

    /** Populate domain settings table with the given domain settings list. */
    function updateDomainSettingsTable(domainSettingsLst) {
        while (domainTable.lastChild) {
            domainTable.removeChild(domainTable.lastChild);
        }
        for (const [domain, domainSettings] of domainSettingsLst) {
            addDomainRow(domain, domainSettings);
        }
    }

    /** Update UI elements according to the given settings. */
    function updateUi(settings) {
        if (settings.deduplicateThumbs) {
            ddByUrlAndThumb.checked = true;
        } else {
            ddByUrlOnly.checked = true;
        }
        const domainSettingsLst = settings.domainSettings;
        numDomains.textContent = domainSettingsLst.length;
        updateDomainSettingsTable(domainSettingsLst);
        if (settings.hashFunction === 'diffHash') {
            diffHash.checked = true;
        } else if (settings.hashFunction === 'waveletHash') {
            waveletHash.checked = true;
        } else {
            dctHash.checked = true;
        }
        maxHammingDistance.valueAsNumber = settings.maxHammingDistance;
        maxHammingDistanceText.value = maxHammingDistance.value;
        partitionByDomain.checked = !!settings.partitionByDomain;
        showHashValues.checked = !!settings.showHashValues;
    }

    ddByUrlAndThumb.addEventListener('click', (event) => {
        browser.storage.local.set({deduplicateThumbs: true});
    });
    ddByUrlOnly.addEventListener('click', (event) => {
        browser.storage.local.set({deduplicateThumbs: false});
    });

    domainSettingsButton.addEventListener('click', (event) => {
        settingsDiv.style.display = 'none';
        domainSettingsDiv.style.display = '';
    });

    dctHash.addEventListener('click', (event) =>
        browser.storage.local.set({hashFunction: 'dctHash'}));
    diffHash.addEventListener('click', (event) =>
        browser.storage.local.set({hashFunction: 'diffHash'}));
    waveletHash.addEventListener('click', (event) =>
        browser.storage.local.set({hashFunction: 'waveletHash'}));

    maxHammingDistance.addEventListener('change', (event) => {
        maxHammingDistanceText.value = maxHammingDistance.value;
        browser.storage.local.set(
            {maxHammingDistance: maxHammingDistance.valueAsNumber});
    });
    maxHammingDistance.addEventListener('input', (event) => {
        maxHammingDistanceText.value = maxHammingDistance.value;
    });
    partitionByDomain.addEventListener('change', (event) => {
        browser.storage.local.set(
            {partitionByDomain: partitionByDomain.checked});
    });
    showHashValues.addEventListener('change', (event) => {
        browser.storage.local.set(
            {showHashValues: showHashValues.checked});
    });

    reset.addEventListener('click', (event) => {
        updateUi(defaultSettings);
        browser.storage.local.clear();
    });

    domainInputButton.addEventListener('click', (event) => {
        const domain = domainInputText.value;
        const domainSettings = {
            deduplicateThumbs: domainInputCheckbox.checked,
        };
        addDomainRow(domain, domainSettings);
        saveDomainSettings();
        domainInputText.value = "";
        domainInputCheckbox.checked = false;
    });

    domainSettingsBack.addEventListener('click', (event) => {
        domainInputText.value = "";
        domainInputCheckbox.checked = false;
        settingsDiv.style.display = '';
        domainSettingsDiv.style.display = 'none';
    });

    getSettings().then(updateUi).catch(
        (error) => console.warn("Failed to restore settings", error));
});
