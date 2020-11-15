function onLoad() {
    const dctHash = document.getElementById('dctHash');
    const diffHash = document.getElementById('diffHash');
    const maxHammingDistance = document.getElementById('maxHammingDistance');
    const partitionByDomain = document.getElementById('partitionByDomain');
    const showHashValues = document.getElementById('showHashValues');

    function hashFunctionListener(event) {
        if (event.target.checked) {
            browser.storage.local.set({hashFunction: event.target.value});
        }
    }
    dctHash.addEventListener('change', hashFunctionListener);
    diffHash.addEventListener('change', hashFunctionListener);

    maxHammingDistance.addEventListener('change', (event) => {
        browser.storage.local.set(
            {maxHammingDistance: maxHammingDistance.valueAsNumber});
    });
    partitionByDomain.addEventListener('change', (event) => {
        browser.storage.local.set(
            {partitionByDomain: partitionByDomain.checked});
    });
    showHashValues.addEventListener('change', (event) => {
        console.log(event);
        browser.storage.local.set(
            {showHashValues: showHashValues.checked});
    });

    restoreSettings().catch(
        (error) => console.warn("Failed to retrieve settings", error));
}

async function restoreSettings() {
    const settings = await browser.storage.local.get(
        ['hashFunction', 'maxHammingDistance', 'partitionByDomain',
         'showHashValues']);
    if (settings.hashFunction === 'diffHash'
        || settings.hashFunction === 'dctHash') {
            document.getElementById(settings.hashFunction).checked = true;
    }
    if (settings.maxHammingDistance !== undefined) {
        document.getElementById('maxHammingDistance').valueAsNumber =
            settings.maxHammingDistance;
    }
    if (settings.partitionByDomain !== undefined) {
        document.getElementById('partitionByDomain').checked =
            !!settings.partitionByDomain;
    }
    if (settings.showHashValues !== undefined) {
        document.getElementById('showHashValues').checked =
            !!settings.showHashValues;
    }
}

document.addEventListener("DOMContentLoaded", onLoad);
