"use strict";

/**
 * Convert an ArrayBuffer to a base64-encoded string.
 *
 * @param {ArrayBuffer} buffer ArrayBuffer containing data to encode.
 * @return {String} Base64-encoded string.
 */
function bufToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Hosts serving Reddit thumbnail images. Legacy thumbnails come from
 * thumbs.redditmedia.com; current ones come from preview.redd.it and
 * external-preview.redd.it.
 *
 * @constant {Array<String>}
 */
const previewHosts = ['preview.redd.it', 'external-preview.redd.it'];

/**
 * Determine whether the given host serves Reddit thumbnails.
 *
 * @param {String} hostname Host to check
 * @return {Boolean} Whether we are willing to fetch images from this host.
 */
function isThumbnailHost(hostname) {
    return hostname.endsWith('.thumbs.redditmedia.com')
        || previewHosts.includes(hostname);
}

// Although the documentation has a warning not to use an async function, it's
// perfectly fine for our use case since we always want to send a response in
// this script.
browser.runtime.onMessage.addListener(async (message, sender) => {
    try {
        const url = new URL(message.url, sender.url);
        // For security, make sure the requested domain is valid
        if (!isThumbnailHost(url.hostname)) {
            throw new Error("Invalid domain");
        }
        // Also make sure to use HTTPS
        url.protocol = 'https:';
        const hash = await fetchImageAndGetHash(
            url.href, message.hashFunction);
        return {hash: bufToBase64(hash)};
    } catch (error) {
        console.warn(message, error);
        return {error: "Failed to get image hash"};
    }
});
