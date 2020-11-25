function onLoad() {
    const ddByUrlAndThumb = document.getElementById('ddByUrlAndThumb');
    const ddByUrlOnly = document.getElementById('ddByUrlOnly');
    const dctHash = document.getElementById('dctHash');
    const diffHash = document.getElementById('diffHash');
    const maxHammingDistance = document.getElementById('maxHammingDistance');
    const maxHammingDistanceText =
        document.getElementById('maxHammingDistanceText');
    const partitionByDomain = document.getElementById('partitionByDomain');
    const showHashValues = document.getElementById('showHashValues');
    const reset = document.getElementById('reset');

    function updateThumbnailHashElementsDisabled() {
        const disabled = ddByUrlOnly.checked;
        dctHash.disabled = disabled;
        diffHash.disabled = disabled;
        maxHammingDistance.disabled = disabled;
        maxHammingDistanceText.disabled = disabled;
        partitionByDomain.disabled = disabled;
        showHashValues.disabled = disabled;
    };

    ddByUrlAndThumb.addEventListener('click', (event) => {
        browser.storage.local.set({deduplicateThumbs: true});
        updateThumbnailHashElementsDisabled();
    });
    ddByUrlOnly.addEventListener('click', (event) => {
        browser.storage.local.set({deduplicateThumbs: false});
        updateThumbnailHashElementsDisabled();
    });

    dctHash.addEventListener('click', (event) =>
        browser.storage.local.set({hashFunction: 'dctHash'}));
    diffHash.addEventListener('click', (event) =>
        browser.storage.local.set({hashFunction: 'diffHash'}));

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
        ddByUrlAndThumb.checked = true;
        dctHash.checked = true;
        maxHammingDistance.valueAsNumber = 8;
        maxHammingDistanceText.value = maxHammingDistance.value;
        partitionByDomain.checked = true;
        showHashValues.checked = false;
        updateThumbnailHashElementsDisabled();
        browser.storage.local.clear();
    });

    async function restoreSettings() {
        const settings = await browser.storage.local.get(
            ['deduplicateThumbs', 'hashFunction', 'maxHammingDistance',
             'partitionByDomain', 'showHashValues']);

        if (settings.deduplicateThumbs === true) {
            ddByUrlAndThumb.checked = true;
        } else if (settings.deduplicateThumbs === false) {
            ddByUrlOnly.checked = true;
        }
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
        updateThumbnailHashElementsDisabled();
    }

    restoreSettings().catch(
        (error) => console.warn("Failed to retrieve settings", error));
}

document.addEventListener("DOMContentLoaded", onLoad);
