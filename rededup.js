/**
 * User settings.
 *
 * @typedef {Object} Settings
 * @property {String} hashFunction - Image hash function
 * @property {Number} maxHammingDistance - Maximum Hamming distance for
 *     thumbnail hash comparison
 * @property {Boolean} partitionByDomain - Whether to segregate posts by domain
 *     when checking for thumbnail duplicates
 * @property {Boolean} showHashValues - Whether to show thumbnail hash values
 *     in post taglines
 */

/**
 * Get user settings from local storage or default values.
 *
 * @return {Settings} Retrieved user settings.
 */
async function getSettings() {
    const defaultSettings = {
        hashFunction: 'dctHash',
        maxHammingDistance: 4,
        partitionByDomain: true,
        showHashValues: false,
    };
    try {
        return await browser.storage.local.get(defaultSettings);
    } catch (error) {
        console.warn("Error fetching settings", error);
        return defaultSettings;
    }
}

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
    try {
        return await loadImage(blobUrl);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
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
 * Scale the given image to the specified size and extract pixel data.
 *
 * @param {Image} img Source image
 * @param {Number} width Desired width
 * @param {Number} height Desired height
 * @return {Uint8ClampedArray} Pixel data of scaled image.
 */
function getImagePixels(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    return ctx.getImageData(0, 0, width, height).data;
}

/**
 * Generator to convert a stream of bits to an array of bytes. The caller uses
 * the generator's next() method to supply a stream of bits. For each eight
 * bits submitted, the generator adds a byte to the input array.
 *
 * @param {Uint8Array} arr Array for storing results
 */
function* bitAppender(arr) {
    let byteIndex = 0;
    let currentByte = 0;
    let bitCount = 0;
    while (true) {
        const bit = yield;
        currentByte = (currentByte << 1) | (bit ? 1 : 0);
        bitCount += 1;
        if (bitCount === 8) {
            arr[byteIndex] = currentByte;
            byteIndex += 1;
            currentByte = 0;
            bitCount = 0;
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
function getDiffHash(img) {
    // Rather than comparing pixels along each row of the scaled image, we
    // compare pixel values along a space-filling loop, as suggested in a
    // comment by user "AlexHackerFactor".
    if (!getDiffHash._MC3) {
        getDiffHash._MC3 = Array.from(
            mooreCurve(3), (p) => (p[0] + (8*p[1])) * 4);
    }
    const MC3 = getDiffHash._MC3;

    const imgPixels = getImagePixels(img, 8, 8);

    const hash = new Uint8Array(8);
    const hashGen = bitAppender(hash);
    let prev = (imgPixels[MC3[63]] + imgPixels[MC3[63]+1]
                + imgPixels[MC3[63]+2]) / 3;
    for (const p of MC3) {
        const curr = (imgPixels[p] + imgPixels[p+1] + imgPixels[p+2]) / 3;
        hashGen.next(prev < curr);
        prev = curr;
    }
    return hash.buffer;
}

/**
 * Compute a 64-bit perceptual hash of an image based on the DCT. We scale the
 * image to a 32x32 image, compute the 2-dimensional DCT, then use the sign
 * bits of the upper-left triangle of coefficients as the bits of the hash.
 *
 * @param {Image} img An image in a complete, non-broken state
 * @return {ArrayBuffer} An 8-byte buffer containing the hash value.
 */
function getDctHash(img) {
    const D = new Array(11);
    {
        const imgPixels = getImagePixels(img, 32, 32);
        const X = new Float64Array(32);  // DCT input
        const A_buf = new ArrayBuffer(32*11*8);  // Intermediate 32x11 array
        for (let i = 0; i < 32; i++) {
            for (let j = 0; j < 32; j++) {
                const k = (32*i + j) * 4;
                X[j] = (((imgPixels[k] + imgPixels[k+1] + imgPixels[k+2]) / 3)
                        - 128);
            }
            const Z = new Float64Array(A_buf, i*88, 11);  // DCT output
            fdct32_11(X, Z);
        }
        const A = new Float64Array(A_buf);  // Buffer view
        const D_buf = new ArrayBuffer(11*11*8);  // 11x11 result buffer
        for (let i = 0; i < 11; i++) {
            // Copy column i of A into X
            for (let j = 0; j < 32; j++) {
                X[j] = A[j*11 + i];
            }
            const Z = D[i] = new Float64Array(D_buf, i*88, 11);  // DCT output
            fdct32_11(X, Z);
        }
    }

    const hash = new Uint8Array(8);
    const hashGen = bitAppender(hash);
    // To get 64 bits we take the upper-left triangle of size 11, omitting the
    // zero-frequency coefficient at (0, 0) and the coefficient at (5, 5).
    for (let i = 1; i <= 10; i++) {
        for (let j = 0; j <= i; j++) {
            if (i === 10 && j === 5) {
                continue;
            }
            hashGen.next(D[i-j][j] >= 0);
        }
    }
    return hash.buffer;
}

/**
 * Compute a 64-bit perceptual hash of an image.
 *
 * @param {Image} img An image in a complete, non-broken state
 * @param {Settings} settings User settings
 * @return {ArrayBuffer} An 8-byte buffer containing the hash value.
 */
function getImageHash(img, settings) {
    if (!img.complete) {
        throw "Image not complete";
    }
    if (img.naturalWidth === 0) {
        throw "Image broken";
    }

    switch (settings.hashFunction) {
        case 'diffHash':
            return getDiffHash(img);
        case 'dctHash':
        default:
            return getDctHash(img);
    }
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

const indexSymbol = Symbol('index');

/**
 * Information about a link in the site table.
 * @typedef {Object} LinkInfo
 * @property {Element} thing - Top-level element for the link
 * @property {String} url - Link url
 * @property {String} domain - Link domain
 * @property {?ArrayBuffer} thumbnailHash - Image hash of the link thumbnail if
 *     available
 */

/**
 * Compute link info for a link in the site table.
 *
 * @param {Element} thing A site table link
 * @param {Settings} settings User settings
 * @return {Promise<LinkInfo>} Link information
 */
async function getLinkInfo(thing, settings) {
    if (!thing.offsetParent) {
        // Element is not visible (perhaps due to ad blocker), skip it
        return null;
    }
    const linkInfo = {
        thing: thing,
        url: thing.dataset.url,
        domain: thing.dataset.domain,
    }
    const thumbnailImg = thing.querySelector(':scope > .thumbnail > img');
    if (thumbnailImg) {
        try {
            // Need to re-fetch the image due to same-origin policy
            const soImg = await fetchImage(thumbnailImg.src);
            linkInfo.thumbnailHash = getImageHash(soImg, settings);
            if (settings.showHashValues) {
                const tagline = thing.querySelector('.tagline');
                const hashElt = document.createElement('code');
                hashElt.textContent = bufToHex(linkInfo.thumbnailHash);
                tagline.append(' [', hashElt, ']');
            }
        } catch (error) {
            console.warn("Failed to get thumbnail hash", thumbnailImg, error);
        }
    }
    return linkInfo;
}

/**
 * Information about a link with duplicates.
 *
 * @typedef {Object} DupRecord
 * @property {Element} thing - Primary link
 * @property {Number} index - Primary link index
 * @property {Element[]} duplicates - Duplicate links
 * @property {Boolean} showDuplicates - Whether to show or hide duplicate links
 * @property {Element} taglineElt - Element within the primary link tagline
 * @property {Element} countElt - Element for displaying the duplicate count
 * @property {Element} linkElt - Element for toggling duplicate visibility
 */

/**
 * Create a new duplicate record.
 *
 * @param {Element} thing Primary link element
 * @return {DupRecord} A new duplicate record, initially with no duplicates.
 */
function newDupRecord(thing) {
    return {
        thing: thing,
        index: thing[indexSymbol],
        duplicates: [],
        showDuplicates: false,
    };
}

/**
 * Merge duplicates from two duplicate records.
 *
 * @param {Element[]} duplicates First record duplicates
 * @param {Element} otherThing Primary link of second record
 * @param {Element[]} otherDuplicates Second record duplicates
 * @yields {Element} The given elements in order.
 */
function* mergeDuplicates(duplicates, otherThing, otherDuplicates) {
    let x = duplicates[0];
    let nx = 1;
    let y = otherThing;
    let ny = 0;
    while (x && y) {
        if (x[indexSymbol] < y[indexSymbol]) {
            yield x;
            x = duplicates[nx++];
        } else {
            yield y;
            y = otherDuplicates[ny++];
        }
    }
    while (x) {
        yield x;
        x = duplicates[nx++];
    }
    while (y) {
        yield y;
        y = otherDuplicates[ny++];
    }
}

/**
 * Add elements to a post's tagline and updates the duplicate record.
 *
 * @param {DupRecord} dupRecord Information about the link
 */
function initTagline(dupRecord) {
    dupRecord.countElt = document.createElement('span');
    dupRecord.countElt.textContent = '0 duplicates';
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
    dupRecord.taglineElt = document.createElement('span');
    dupRecord.taglineElt.append(
        ' (', dupRecord.countElt, ' — ', dupRecord.linkElt, ')');
    const tagline = dupRecord.thing.querySelector('.tagline');
    tagline.append(dupRecord.taglineElt);
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
 * Stats object.
 *
 * @typedef {Object} Stats
 * @property {Number} numWithDups - Number of links with at least one duplicate
 * @property {Number} totalDups - Total number of duplicate links
 */

/**
 * Merge a duplicate record into an existing record.
 *
 * @param {DupRecord} dupRecord Duplicate record to update
 * @param {DupRecord} otherRecord Duplicate record to merge
 * @param {Stats} stats Stats object
 */
function mergeDupRecords(dupRecord, otherRecord, stats) {
    // Update stats
    if (!dupRecord.duplicates.length) {
        stats.numWithDups += 1;
    }
    if (otherRecord.duplicates.length) {
        stats.numWithDups -= 1;
    }
    stats.totalDups += 1;

    // Merge duplicate lists
    const duplicates = new Array(dupRecord.duplicates.length
                                 + otherRecord.duplicates.length + 1);
    let i = 0;
    let prev = dupRecord.thing;
    for (const dup of mergeDuplicates(dupRecord.duplicates, otherRecord.thing,
                                      otherRecord.duplicates)) {
        // Update display CSS property
        dup.style.display = dupRecord.showDuplicates ? '' : 'none';
        // Reorder duplicate to come after preceding duplicate or primary
        moveThingAfter(prev, dup);
        // Add duplicate to new array
        duplicates[i++] = dup;
        prev = dup;
    }
    dupRecord.duplicates = duplicates;

    // Update primary link tagline
    if (!dupRecord.taglineElt) {
        initTagline(dupRecord);
    }
    const s = duplicates.length > 1 ? 's' : '';
    dupRecord.countElt.textContent =
        `${duplicates.length} duplicate${s}`;

    // Clean up other tagline
    if (otherRecord.taglineElt) {
        otherRecord.taglineElt.remove();
        delete otherRecord.taglineElt;
        delete otherRecord.countElt;
        delete otherRecord.linkElt;
    }
}

/**
 * Disjoint-set node.
 * @typedef {Object} DSNode
 * @property {?DSNode} parent - Parent node
 * @property {Number} rank - Node rank
 */

/**
 * Create a new disjoint-set node.
 *
 * @param value Node value
 * @return {DSNode} A new node with the given value.
 */
function newDsNode(value) {
    return {
        parent: null,
        rank: 0,
    }
}

/**
 * Find the representative of a disjoint-set node.
 *
 * @param {DSNode} node A node
 * @return {DSNode} The given node's representative.
 */
function dsFind(node) {
    while (node.parent) {
        const parent = node.parent;
        node.parent = parent.parent || parent;
        node = parent;
    }
    return node;
}

/**
 * Merge two disjoint-set nodes into the same tree.
 *
 * @param {DSNode} node A node
 * @param {DSNode} other Another node
 * @param {DSNode} The representative after merging.
 */
function dsUnion(node, other) {
    node = dsFind(node);
    other = dsFind(other);
    if (node === other) {
        return node;
    }
    if (node.rank < other.rank) {
        const tmp = node;
        node = other;
        other = tmp;
    }
    other.parent = node;
    if (node.rank === other.rank) {
        node.rank += 1;
    }
    return node;
}

/**
 * Count the number of 1 bits in a 32-bit integer.
 *
 * @param {Number} n An integer
 * @return {Number} The number of 1s in the integer's 32-bit representation.
 */
function bitCount32(n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

/**
 * Compute the Hamming distance between two 64-bit values, represented as pairs
 * of 32-bit integers.
 *
 * @param {Int32Array} a1 An array containing two 32-bit integers
 * @param {Int32Array} a2 A second array containing two 32-bit integers
 * @return {Number} The Hamming distance between the two values.
 */
function hdist(a1, a2) {
    return bitCount32(a1[0] ^ a2[0]) + bitCount32(a1[1] ^ a2[1]);
}

/**
 * A BK-tree mapping image hashes to disjoint-set nodes. This implementation is
 * specific to our use-case.
 *
 * @typedef {Object} BKNode
 * @property {Int32Array} key - An image hash as a pair of 32-bit integers
 * @property {DSNode} value - Disjoint-set node for the image hash
 * @property {Map} children - A map from metric values to child nodes.
 */

/**
 * Create a new BK-tree node.
 *
 * @param {Int32Array} key Node key
 * @param {DSNode} value Node value
 * @return {BKNode} A new node with the given key and value.
 */
function bkNew(key, value) {
    return {
        key: key,
        value: value,
        children: new Map(),
    };
}

/**
 * Add a key-value pair in a BK-tree map. If the given key already exists, do
 * nothing.
 *
 * @param {BKNode} bkNode BK-tree node
 * @param {Int32Array} key Map key
 * @param {DSNode} value Map value
 */
function bkAdd(bkNode, key, value) {
    while (true) {
        const dist = hdist(bkNode.key, key);
        if (dist === 0) {
            return;
        } else if (bkNode.children.has(dist)) {
            bkNode = bkNode.children.get(dist);
        } else {
            bkNode.children.set(dist, bkNew(key, value));
            return;
        }
    }
}

/**
 * Find all nodes within a given distance for the given key in a BK-tree map.
 *
 * @param {BKNode} bkNode BK-tree node
 * @param {Int32Array} key Map key
 * @param {Number} maxDist Maximum Hamming distance, inclusive.
 * @yields {DSNode} Values for all keys within the given Hamming distance of
 *     the specified key.
 */
function* bkFind(bkNode, key, maxDist) {
    const dist = hdist(bkNode.key, key);
    if (dist <= maxDist) {
        yield bkNode.value;
    }
    const i0 = Math.abs(dist - maxDist);
    const i1 = Math.min(dist + maxDist, 64);
    for (let i = i0; i <= i1; i += 1) {
        if (bkNode.children.has(i)) {
            yield* bkFind(bkNode.children.get(i), key, maxDist);
        }
    }
}

/**
 * Unify disjoint-set nodes and update the associated duplicate records.
 *
 * @param {DSNode} A disjoint-set node
 * @param {DSNode} Another disjoint-set node
 * @param {Stats} stats Stats object
 */
function mergeDsNodes(node1, node2, stats) {
    node1 = dsFind(node1);
    node2 = dsFind(node2);
    if (node1 === node2) {
        return;
    }
    const newNode = dsUnion(node1, node2);

    let dupRecord = node1.dupRecord;
    let otherRecord = node2.dupRecord;
    if (otherRecord.index < dupRecord.index) {
        const tmp = dupRecord;
        dupRecord = otherRecord;
        otherRecord = tmp;
    }
    mergeDupRecords(dupRecord, otherRecord, stats);

    delete node1.dupRecord;
    delete node2.dupRecord;
    newNode.dupRecord = dupRecord;
}

/**
 * Update disjoint-set data structure for a given link based on thumbnail hash.
 *
 * @param {Map} thumbDomainMap Domain map
 * @param {LinkInfo} info Link info
 * @param {DSNode} node Disjoint-set node for the link
 * @param {Settings} settings User settings
 * @param {Stats} stats Stats object
 */
function updateThumbMap(thumbDomainMap, info, node, settings, stats) {
    const domainKey = settings.partitionByDomain ? info.domain : '';
    let thumbMap = thumbDomainMap.get(domainKey);
    if (!thumbMap) {
        // Set up data structures for new domain
        thumbMap = new Map();
        thumbMap.set(bufToString(info.thumbnailHash), node);
        if (settings.maxHammingDistance > 0) {
            thumbMap.bkMap = bkNew(new Int32Array(info.thumbnailHash), node);
        }
        thumbDomainMap.set(domainKey, thumbMap);
        return;
    }

    const hashStr = bufToString(info.thumbnailHash);
    if (thumbMap.has(hashStr)) {
        // Exact hash match, merge with existing node.
        mergeDsNodes(thumbMap.get(hashStr), node, stats);
        // No need to search for nearby hash values as we did this the first
        // time we encountered this value.
        return;
    }
    thumbMap.set(hashStr, node);

    if (settings.maxHammingDistance > 0) {
        const bkMapKey = new Int32Array(info.thumbnailHash);
        // Merge with hash values within max radius
        for (let otherNode of bkFind(thumbMap.bkMap, bkMapKey,
                                     settings.maxHammingDistance)) {
            mergeDsNodes(node, otherNode, stats);
        }
        bkAdd(thumbMap.bkMap, bkMapKey, node);
    }
}

/**
 * Update duplicate records with information about a link.
 *
 * @param {Map} urlMap Map from URLs to disjoint-set nodes
 * @param {Map} thumbDomainMap Map from domain to thumbnail hash to
 *     disjoint-set nodes.
 * @param {LinkInfo} linkInfo Information about a link
 * @param {Settings} settings User settings
 * @param {Stats} stats Stats object
 */
function updateDuplicates(urlMap, thumbDomainMap, linkInfo, settings, stats) {
    if (!linkInfo) {
        return;
    }
    const node = newDsNode();
    node.dupRecord = newDupRecord(linkInfo.thing);
    // Merge by URL
    if (linkInfo.url) {
        const url = linkInfo.url;
        if (urlMap.has(url)) {
            mergeDsNodes(urlMap.get(url), node, stats);
        } else {
            urlMap.set(url, node);
        }
    }
    // Merge by thumbnail
    if (linkInfo.thumbnailHash) {
        updateThumbMap(thumbDomainMap, linkInfo, node, settings, stats);
    }
}

const duplicatesPath = new RegExp('^/[^/]+/[^/]+/duplicates/');

/**
 * Main content script entry point. Queries the DOM for links and performs
 * duplicate processing.
 */
async function main() {
    const t0 = performance.now();
    const path = window.location.pathname;
    if (duplicatesPath.test(path)) {
        console.log("Other Discussions page");
        return;
    }
    const links = document.body.querySelectorAll('#siteTable > .thing.link');
    if (!links.length) {
        console.log("No links found");
        return;
    }
    console.log("Processing", links.length, "links");
    const settings = await getSettings();

    const urlMap = new Map();
    const thumbDomainMap = new Map();
    const stats = {numWithDups: 0, totalDups: 0};
    const promises = new Array(links.length);
    let index = 0;
    for (let link of links) {
        link[indexSymbol] = index;
        promises[index] = getLinkInfo(link, settings)
            .then((linkInfo) => updateDuplicates(
                      urlMap, thumbDomainMap, linkInfo, settings, stats))
            .catch((error) => console.warn(error));
        index++;
    }

    // Wait for all promises to complete
    for (let promise of promises) {
        await promise;
    }

    const t1 = performance.now();
    if (stats.numWithDups === 0) {
        console.log("No duplicates found", `(${t1-t0} ms)`);
    } else {
        const s1 = stats.numWithDups > 1 ? 's' : '';
        const s2 = stats.totalDups > 1 ? 's' : '';
        console.log(`Found ${stats.numWithDups} item${s1}`,
                    `with ${stats.totalDups} duplicate${s2}`,
                    `(${t1-t0} ms)`);
    }
}

main().catch((error) => console.error(error));
