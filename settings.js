/**
 * User settings.
 *
 * @typedef {Object} Settings
 * @property {Boolean} deduplicateThumbs - Whether to deduplicate posts by
 *     thumbnail
 * @property {String} hashFunction - Image hash function
 * @property {Number} maxHammingDistance - Maximum Hamming distance for
 *     thumbnail hash comparison
 * @property {Boolean} partitionByDomain - Whether to segregate posts by domain
 *     when checking for thumbnail duplicates
 * @property {Boolean} showHashValues - Whether to show thumbnail hash values
 *     in post taglines
 */

const defaultSettings = Object.freeze({
    deduplicateThumbs: true,
    hashFunction: 'dctHash',
    maxHammingDistance: 8,
    partitionByDomain: true,
    showHashValues: false,
});

/**
 * Get user settings from local storage or default values.
 *
 * @return {Settings} Retrieved user settings.
 */
async function getSettings() {
    try {
        return await browser.storage.local.get(defaultSettings);
    } catch (error) {
        console.warn("Error fetching settings", error);
        return defaultSettings;
    }
}
