/**
 * Fetch data from an image URL, create an Image from the data, and return the
 * image once it has loaded. In order to fetch the image data the extension
 * must have cross-domain access for the source domain.
 *
 * The resulting image has the same origin as the extension, allowing us to
 * draw it to a canvas and extract its pixel data without violating the
 * browser's same-origin security policy.
 *
 * @see {@link https://stackoverflow.com/questions/49013975/}
 * @param {String} srcUrl An image url
 * @returns {Promise<Image>} An image with data from the source URL.
 */
async function fetchImage(srcUrl) {
    const resp = await fetch(srcUrl);
    const blobUrl = URL.createObjectURL(await resp.blob());
    const result = await loadImage(blobUrl);
    URL.revokeObjectURL(blobUrl);
    return result;
}

/**
 * Create an Image with the given url.
 *
 * @param {String} url An image url
 * @returns {Promise<Image>} A promise object that will be fulfilled with the
 *     image when loading is complete. If the image fails to load, the promise
 *     will be rejected.
 */
function loadImage(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
    });
}

/**
 * Generate the nth Moore Curve as an L-system.
 *
 * @param {Number} n An integer n >= 1.
 * @yields {String} A sequence of characters in ['L', 'R', 'F', '+', '-'].
 */
function* mooreCurveL(n) {
    if (n === 1) {
        yield* 'LFL+F+LFL';
        return;
    }
    for (const c of mooreCurveL(n - 1)) {
        switch (c) {
            case 'L':
                yield* '-RF+LFL+FR-';
                break;
            case 'R':
                yield* '+LF-RFR-FL+';
                break;
            default:
                yield c;
                break;
        }
    }
}

/**
 * Generate the nth Moore Curve as a sequence of points.
 *
 * @param {Number} n An integer n >= 1.
 * @yields {Number[]} A sequence of (x, y) pairs describing a Moore curve over
 *         a 2^n x 2^n grid.
 */
function* mooreCurve(p) {
    const D = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    let x = (2 ** (p - 1)) - 1;
    let y = (2 ** p) - 1;
    let d = 0;

    yield [x, y];
    for (const c of mooreCurveL(p)) {
        switch (c) {
            case 'F':
                x += D[d][0];
                y += D[d][1];
                yield [x, y];
                break;
            case '+':
                d = (d + 1) % 4;
                break;
            case '-':
                d = (d + 3) % 4;
                break;
            default:
                break;
        }
    }
}

/**
 * Compute a 64-bit perceptual hash of an image using the "dHash" algorithm.
 * The basic idea is to scale the image to a small fixed size and compare
 * grayscale values between pixels to produce the bits of the hash.
 *
 * @see {@link https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html}
 * @param {Image} img An image in a complete, non-broken state
 * @return {ArrayBuffer} An 8-byte buffer containing the hash value.
 */
function getImageHash(img) {
    if (!img.complete) {
        throw "Image not complete";
    }
    if (img.naturalWidth === 0) {
        throw "Image broken";
    }

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 8, 8);
    const imgData = ctx.getImageData(0, 0, 8, 8);
    const imgPixels = imgData.data;

    // Rather than comparing pixels along each row of the scaled image, we
    // compare pixel values along a space-filling loop, as suggested in a
    // comment by user "AlexHackerFactor".
    if (!getImageHash._MC3) {
        getImageHash._MC3 = Array.from(
            mooreCurve(3), (p) => (p[0] + (8*p[1])) * 4);
    }
    const MC3 = getImageHash._MC3;

    let hash = new Uint8Array(8);
    let byteIndex = 0;
    let currentByte = 0;
    let bitCount = 0;
    let prev = (imgPixels[MC3[63]] + imgPixels[MC3[63]+1]
                + imgPixels[MC3[63]+2]) / 3;
    for (const p of MC3) {
        const curr = (imgPixels[p] + imgPixels[p+1] + imgPixels[p+2]) / 3;
        currentByte = (currentByte << 1) | ((prev < curr) ? 1 : 0);
        bitCount += 1;
        if (bitCount === 8) {
            hash[byteIndex] = currentByte;
            byteIndex += 1;
            currentByte = 0;
            bitCount = 0;
        }
        prev = curr;
    }
    return hash.buffer;
}

/**
 * Convert an ArrayBuffer to a human-readable hex string for logging or similar
 * purposes.
 *
 * @param {ArrayBuffer} buffer An array of binary data
 * @return {String} A string representing the data in hexadecimal notation.
 */
function bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer),
                      (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Convert an ArrayBuffer to a string. Note that the resulting string may not
 * be valid UTF-16 data, so it should not be used for human-readable purposes.
 * The result depends on the platform's endianness.
 *
 * @param {ArrayBuffer} buffer An array of binary data
 * @return {String} A string whose code units correspond to the data
 *     interpreted as a Uint16Array.
 */
function bufToString(buffer) {
    return String.fromCharCode(...new Uint16Array(buffer));
}

/**
 * Information about a link in the site table.
 * @typedef {Object} LinkInfo
 * @property {Element} thing - Top-level element for the link
 * @property {String} hash - Image hash of the link thumbnail
 */

/**
 * Compute link info for a link thumbnail.
 *
 * @param img An image element for a link thumbnail
 * @return {Promise<?LinkInfo>} Link information, or null if an exception
 *     occurred while fetching the image.
 */
async function processThumbnail(img) {
    try {
        // Need to re-fetch the image due to same-origin policy
        const soImg = await fetchImage(img.src);
        return {
            thing: img.parentElement.parentElement,
            hash: getImageHash(soImg),
        };
    } catch (error) {
        console.warn(img, error);
        return null;
    }
}

/**
 * Information about a link with duplicates.
 *
 * @typedef {Object} DupRecord
 * @property {Element} thing - Primary link
 * @property {Element[]} duplicates - Duplicate links
 * @property {Boolean} showDuplicates - Whether to show or hide duplicate links

 * @property {Element} countElt - Element for displaying the duplicate count
 * @property {Element} linkElt - Element for toggling duplicate visibility
 */

/**
 * Add elements to a post's tagline and updates the duplicate record.
 *
 * @param {DupRecord} dupRecord Information about the link
 */
function initTagline(dupRecord) {
    dupRecord.countElt = document.createElement('span');
    dupRecord.countElt.textContent = '? duplicate(s)';
    dupRecord.linkElt = document.createElement('a');
    dupRecord.linkElt.textContent = dupRecord.showDuplicates ? 'hide' : 'show';
    dupRecord.linkElt.href = '#';
    dupRecord.linkElt.onclick = (() => {
        dupRecord.showDuplicates = !dupRecord.showDuplicates;
        dupRecord.linkElt.textContent =
            dupRecord.showDuplicates ? 'hide' : 'show';
        for (const thing of dupRecord.duplicates) {
            thing.style.display = dupRecord.showDuplicates ? '' : 'none';
        }
        return false;
    });
    const tagline = dupRecord.thing.querySelector('.tagline');
    tagline.append(' (', dupRecord.countElt, ' — ', dupRecord.linkElt, ')');
}

/**
 * Move a thing in the site table to come after another thing.
 *
 * @param {Element} thing The first thing
 * @param {Element} otherThing The thing to move
 */
function moveThingAfter(thing, otherThing) {
    // Each thing in the site table is followed by an empty
    // <div class="clearleft"></div> element, we want to preserve that.
    thing.nextSibling.after(otherThing, otherThing.nextSibling);
}

/**
 * Get the last item of an array or return a default value.
 *
 * @param {Array} items An array of values, may be empty
 * @param defaultValue Default value
 * @return The last item in the array, or the default value.
 */
function lastItem(items, defaultValue) {
    return (items.length > 0) ? items[items.length - 1] : defaultValue;
}

/**
 * Add a duplicate to the given duplicate record and update the DOM as needed.
 *
 * @param {DupRecord} dupRecord A duplicate record
 * @param {Element} thing A link element to add as a duplicate
 */
function addDuplicate(dupRecord, thing) {
    // Update display CSS property
    thing.style.display = dupRecord.showDuplicates ? '' : 'none';
    // Reorder duplicate to come after preceding duplicate or primary
    moveThingAfter(lastItem(dupRecord.duplicates, dupRecord.thing), thing);
    // Add duplicate to record
    dupRecord.duplicates.push(thing);
    // Update primary link tagline
    if (!dupRecord.countElt) {
        initTagline(dupRecord);
    }
    const s = dupRecord.duplicates.length > 1 ? 's' : '';
    dupRecord.countElt.textContent =
        `${dupRecord.duplicates.length} duplicate${s}`;
}

/**
 * Process a list of LinkInfo objects, find duplicates, and update the DOM.
 *
 * @param {Promise<LinkInfo>[]} promises An iterable of promises with link
 *     information
 * @return {Promise<Map>} A map whose keys are thumbnail image hash strings and
 *     whose values are DupRecord objects.
 */
async function findDuplicates(promises) {
    const thumbsMap = new Map();
    for (const promise of promises) {
        const result = await promise;
        if (!result) {
            continue;
        }
        const thing = result.thing;
        const hashStr = bufToString(result.hash);
        if (thumbsMap.has(hashStr)) {
            const dupRecord = thumbsMap.get(hashStr);
            addDuplicate(dupRecord, thing);
        } else {
            thumbsMap.set(hashStr, {
                thing: thing,
                duplicates: [],
                showDuplicates: false,
            });
        }
    }
    return thumbsMap;
}

{
    const t0 = performance.now();
    const thumbs = document.body.querySelectorAll(
        '#siteTable > .thing.link > .thumbnail > img');
    console.log("Processing", thumbs.length, "thumbnails");
    // Init all promises, then process results in order
    const promises = Array.from(thumbs, processThumbnail);
    findDuplicates(promises).then((thumbsMap) => {
        const t1 = performance.now();
        let numWithDups = 0;
        let totalDups = 0;
        for (const dupRecord of thumbsMap.values()) {
            if (dupRecord.duplicates.length > 0) {
                numWithDups += 1;
                totalDups += dupRecord.duplicates.length;
            }
        }
        console.log("Found", numWithDups, "items with",
                    totalDups, "total duplicates", `(${t1-t0} ms)`);
    }).catch((error) => {
        console.error(error);
    });
}
