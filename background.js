/**
 * Convert an ArrayBuffer to a base64-encoded string.
 *
 * @param {ArrayBuffer} buffer ArrayBuffer containing data to encode.
 * @return {String} Base64-encoded string.
 */
function bufToBase64(buffer) {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

// Although the documentation has a warning not to use an async function, it's
// perfectly fine for our use case since we always want to send a response in
// this script.
browser.runtime.onMessage.addListener(async (message, sender) => {
    try {
        const url = new URL(message.url, sender.url);
        // For security, make sure the requested domain is valid
        if (!url.hostname.endsWith('.thumbs.redditmedia.com')) {
            throw "Invalid domain";
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
