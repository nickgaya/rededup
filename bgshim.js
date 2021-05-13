"use strict";

/**
 * Convert a base64-encoded string to an ArrayBuffer.
 *
 * @param {String} b64 Base64-encoded string
 * @return {ArrayBuffer} ArrayBuffer containing decoded bytes.
 */
function base64ToBuf(b64) {
    const bstr = atob(b64);
    const arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) {
        arr[i] = bstr.charCodeAt(i);
    }
    return arr.buffer;
}

/**
 * Fetch an image and compute its hash.
 *
 * @param {String} url Source url
 * @param {String} hashFunction Hash function name
 * @return {ArrayBuffer} A buffer containing the image hash value.
 */
async function fetchImageAndGetHash(url, hashFunction) {
    const response = await browser.runtime.sendMessage(
        {url: url, hashFunction: hashFunction});
    if (!response.hash) {
        throw `Background script error: ${response.error || "unknown"}`;
    }
    return base64ToBuf(response.hash);
}
