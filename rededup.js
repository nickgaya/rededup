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
 * Enum for page types.
 * @readonly
 * @enum {String}
 */
const PageType = Object.freeze({
    LISTING_PAGE: 'listing page',
    SEARCH_PAGE: 'search page',
});

/**
 * @typedef {Object} Links
 * @property {?NodeList} links - A list of link elements.
 * @property {String} pageType - Page type
 */

/**
 * Get links from the current page.
 * @return {Links} An object containing the list of links and type.
 */
function getLinks() {
    // See https://www.reddit.com/r/csshelp/wiki/selectors
    if (!document.body.classList.length) {
        // New Reddit, interstitial page, etc.
        return {pageType: "no body class"};
    } else if (document.body.classList.contains('single-page')) {
        // No need to check for duplicates when viewing a single post.
        // This also covers "other discussions" pages.
        return {pageType: "single page"};
    } else if (document.body.classList.contains('listing-page')) {
        // Subreddit or user profile page
        return {
            links: document.body.querySelectorAll('#siteTable > .thing.link'),
            pageType: PageType.LISTING_PAGE,
        };
    } else if (document.body.classList.contains('search-page')) {
        // Search results have a different page structure
        return {
            links: document.body.querySelectorAll(
                '.search-result-listing .search-result-link'),
            pageType: PageType.SEARCH_PAGE,
        };
    } else {
        // Other page such as post submission form, wiki page, etc.
        console.debug("Other page type", document.body.classList);
        return {pageType: "other"};
    }
}

/**
 * Get the tagline element of a link.
 *
 * @param {Element} thing Top-level element for the link
 * @param {String} pageType Page type
 * @return {Element} The link's tagline element.
 */
function getTagline(thing, pageType) {
    switch (pageType) {
        case PageType.LISTING_PAGE:
            return thing.querySelector('.tagline');
        case PageType.SEARCH_PAGE:
            return thing.querySelector('.search-result-meta');
        default:
            throw "Invalid page type";
    }
}

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
 * @param {String} pageType Page type
 * @param {Settings} settings User settings
 * @return {Promise<LinkInfo>} Link information
 */
async function getLinkInfo(thing, pageType, settings) {
    if (!thing.offsetParent) {
        // Element is not visible (perhaps due to ad blocker), skip it
        return null;
    }

    const linkInfo = {
        thing: thing,
    }

    switch (pageType) {
        case PageType.LISTING_PAGE:
            linkInfo.url = thing.dataset.url;
            linkInfo.domain = thing.dataset.domain;
            break;
        case PageType.SEARCH_PAGE:
            const anchor = thing.querySelector('a.search-link')
                || thing.querySelector('a.search-title');
            if (anchor) {
                const linkUrl = new URL(anchor.href, window.location);
                linkInfo.url = linkUrl.href;
                linkInfo.domain = linkUrl.hostname;
            }
            break;
        default:
            throw "Invalid page type";
    }


    if (settings.deduplicateThumbs) {
        const thumbnailImg = thing.querySelector(':scope > .thumbnail > img');
        if (thumbnailImg) {
            try {
                // Make sure we have an absolute url
                const imgUrl = new URL(thumbnailImg.src, window.location).href;
                linkInfo.thumbnailHash = await fetchImageAndGetHash(
                    imgUrl, settings.hashFunction);
                if (settings.showHashValues) {
                    const hashElt = document.createElement('code');
                    hashElt.textContent = bufToHex(linkInfo.thumbnailHash);
                    getTagline(thing, pageType).append(' [', hashElt, ']');
                }
            } catch (error) {
                console.warn("Failed to get thumbnail hash", thumbnailImg,
                             error);
            }
        }
    }
    return linkInfo;
}

/**
 * Symbol for recording the original position of a link on the page. This is
 * used to keep links in order when combining duplicates.
 *
 * @constant {Symbol}
 */
const indexSymbol = Symbol('index');


/**
 * Information about a link with duplicates.
 *
 * @typedef {Object} DupRecord
 * @property {Element} thing - Primary link
 * @property {Number} index - Index of primary link
 * @property {Element[]} duplicates - Duplicate links
 * @property {Boolean} showDuplicates - Whether to show or hide duplicate links
 * @property {Element} taglineElt - Element within the primary link tagline
 *    containing the duplicate count and visibility toggle
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
 * Add elements to a post's tagline and update the duplicate record.
 *
 * @param {DupRecord} dupRecord Information about the link
 * @param {String} pageType Page type
 */
function initTagline(dupRecord, pageType) {
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
    const tagline = getTagline(dupRecord.thing, pageType);
    tagline.append(dupRecord.taglineElt);
}

const clearleftDiv = document.createElement('div');
clearleftDiv.className = 'clearleft';

/**
 * Move a thing in the site table to come after another thing.
 *
 * @param {Element} thing The first thing
 * @param {Element} otherThing The thing to move
 */
function moveThingAfter(thing, otherThing) {
    // Each thing in the site table is followed by an empty
    // <div class="clearleft"></div> element, we want to preserve that.
    let pred = thing;
    if (clearleftDiv.isEqualNode(thing.nextSibling)) {
        pred = thing.nextSibling;
    }
    if (clearleftDiv.isEqualNode(otherThing.nextSibling)) {
        pred.after(otherThing, otherThing.nextSibling);
    } else {
        pred.after(otherThing);
    }
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
 * @param {String} pageType Page type
 * @param {Stats} stats Stats object
 */
function mergeDupRecords(dupRecord, otherRecord, pageType, stats) {
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
        initTagline(dupRecord, pageType);
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
 * @return {DSNode} A new node with rank 0.
 */
function newDsNode() {
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
 * @param {String} pageType Page type
 * @param {Stats} stats Stats object
 */
function mergeDsNodes(node1, node2, pageType, stats) {
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
    mergeDupRecords(dupRecord, otherRecord, pageType, stats);

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
 * @param {String} pageType Page type
 * @param {Settings} settings User settings
 * @param {Stats} stats Stats object
 */
function updateThumbMap(thumbDomainMap, info, node, pageType, settings,
                        stats) {
    const domainKey = settings.partitionByDomain ? (info.domain || '') : '';
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
        mergeDsNodes(thumbMap.get(hashStr), node, pageType, stats);
        return;
    }
    thumbMap.set(hashStr, node);

    if (settings.maxHammingDistance > 0) {
        const bkMapKey = new Int32Array(info.thumbnailHash);
        // Merge with hash values within max radius
        for (let otherNode of bkFind(thumbMap.bkMap, bkMapKey,
                                     settings.maxHammingDistance)) {
            mergeDsNodes(node, otherNode, pageType, stats);
        }
        bkAdd(thumbMap.bkMap, bkMapKey, node);
    }
}

/**
 * Add a new link to the disjoint-set forest and merge duplicates.
 *
 * @param {LinkInfo} linkInfo Information about a link
 * @param {Map} urlMap Map from URLs to disjoint-set nodes
 * @param {Map} thumbDomainMap Map from domain to thumbnail hash to
 *     disjoint-set nodes.
 * @param {String} pageType Page type
 * @param {Settings} settings User settings
 * @param {Stats} stats Stats object
 */
function processLink(linkInfo, urlMap, thumbDomainMap, pageType, settings,
                     stats) {
    if (!linkInfo) {
        return;
    }
    const node = newDsNode();
    node.dupRecord = newDupRecord(linkInfo.thing);
    // Merge by URL
    if (linkInfo.url) {
        const url = linkInfo.url;
        if (urlMap.has(url)) {
            mergeDsNodes(urlMap.get(url), node, pageType, stats);
        } else {
            urlMap.set(url, node);
        }
    }
    // Merge by thumbnail
    if (settings.deduplicateThumbs && linkInfo.thumbnailHash) {
        updateThumbMap(thumbDomainMap, linkInfo, node, pageType, settings,
                       stats);
    }
}

/**
 * Log duplicate stats to the console.
 *
 * @param {Stats} stats Stats object
 * @param {Number} t0 Initial timestamp for performance measurement
 */
function logDupInfo(stats, t0) {
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

/**
 * Main content script entry point. Queries the DOM for links and performs
 * duplicate processing.
 */
async function main() {
    const t0 = performance.now();
    const {links, pageType} = getLinks();
    if (!links) {
        console.log("Not processing page", `(${pageType})`);
        return;
    }
    if (!links.length) {
        console.log("No links found", `(${pageType})`);
        return;
    }
    console.log("Processing", links.length,
                (links.length === 1) ? 'link' : 'links', `(${pageType})`);
    const settings = await getSettings();
    const linkInfos = await Promise.all(
        Array.from(links, (thing, index) => {
            thing[indexSymbol] = index;
            return getLinkInfo(thing, pageType, settings);
        }));
    const urlMap = new Map();
    const thumbDomainMap = new Map();
    const stats = {numWithDups: 0, totalDups: 0};
    for (const linkInfo of linkInfos) {
        processLink(linkInfo, urlMap, thumbDomainMap, pageType, settings,
                    stats);
    }
    logDupInfo(stats, t0);
}

main().catch((error) => console.error(error));
