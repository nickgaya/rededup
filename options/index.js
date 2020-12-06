document.addEventListener("DOMContentLoaded", () => {
    const ddByUrlAndThumb = document.getElementById('ddByUrlAndThumb');
    const ddByUrlOnly = document.getElementById('ddByUrlOnly');
    const dctHash = document.getElementById('dctHash');
    const diffHash = document.getElementById('diffHash');
    const waveletHash = document.getElementById('waveletHash');
    const maxHammingDistance = document.getElementById('maxHammingDistance');
    const maxHammingDistanceText =
        document.getElementById('maxHammingDistanceText');
    const partitionByDomain = document.getElementById('partitionByDomain');
    const showHashValues = document.getElementById('showHashValues');
    const reset = document.getElementById('reset');

    /** Enable or disable UI elements based on deduplication mode. */
    function updateThumbnailHashElementsDisabled() {
        const disabled = ddByUrlOnly.checked;
        dctHash.disabled = disabled;
        diffHash.disabled = disabled;
        waveletHash.disabled = disabled;
        maxHammingDistance.disabled = disabled;
        maxHammingDistanceText.disabled = disabled;
        partitionByDomain.disabled = disabled;
        showHashValues.disabled = disabled;
    };

    /** Update UI elements according to the given settings. */
    function updateUi(settings) {
        if (settings.deduplicateThumbs) {
            ddByUrlAndThumb.checked = true;
        } else {
            ddByUrlOnly.checked = true;
        }
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
        updateThumbnailHashElementsDisabled();
    }

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

    getSettings().then(updateUi).catch(
        (error) => console.warn("Failed to restore settings", error));
});
