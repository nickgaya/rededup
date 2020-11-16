function onLoad() {
    const dctHash = document.getElementById('dctHash');
    const diffHash = document.getElementById('diffHash');
    const maxHammingDistance = document.getElementById('maxHammingDistance');
    const maxHammingDistanceText =
        document.getElementById('maxHammingDistanceText');
    const partitionByDomain = document.getElementById('partitionByDomain');
    const showHashValues = document.getElementById('showHashValues');
    const reset = document.getElementById('reset');

    function hashFunctionListener(event) {
        if (event.target.checked) {
            browser.storage.local.set({hashFunction: event.target.value});
        }
    }
    dctHash.addEventListener('change', hashFunctionListener);
    diffHash.addEventListener('change', hashFunctionListener);

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
        dctHash.checked = true;
        maxHammingDistance.valueAsNumber = 4;
        maxHammingDistanceText.value = "4";
        partitionByDomain.checked = true;
        showHashValues.checked = false;
        browser.storage.local.clear();
    });

    async function restoreSettings() {
        const settings = await browser.storage.local.get(
            ['hashFunction', 'maxHammingDistance', 'partitionByDomain',
             'showHashValues']);
        if (settings.hashFunction === 'dctHash') {
            dctHash.checked = true;
        } else if (settings.hashFunction === 'diffHash') {
            diffHash.checked = true;
        }
        if (settings.maxHammingDistance !== undefined) {
            maxHammingDistance.valueAsNumber = settings.maxHammingDistance;
            maxHammingDistanceText.value = settings.maxHammingDistance;
        }
        if (settings.partitionByDomain !== undefined) {
            partitionByDomain.checked = !!settings.partitionByDomain;
        }
        if (settings.showHashValues !== undefined) {
            showHashValues.checked = !!settings.showHashValues;
        }
    }

    restoreSettings().catch(
        (error) => console.warn("Failed to retrieve settings", error));
}

document.addEventListener("DOMContentLoaded", onLoad);
