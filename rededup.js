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
const PageType = {
    LISTING_PAGE: 'listing page',
    SEARCH_PAGE: 'search page',
}

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
        return {pageType: "New Reddit"};
    } else if (document.body.classList.contains('other-discussions-page')) {
        // The other discussion page shows posts with the same URL as a given
        // post. We don't want to check for duplicates in this view.
        return {pageType: "Other Discussions page"};
    } else if (document.body.classList.contains('single-page')) {
        // No need to check for duplicates when viewing a single post.
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
            throw "Invalid link type";
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
 * Disjoint-set node.
 * @typedef {Object} DSNode
 * @property value - Node value
 * @property {?DSNode} parent - Parent node
 * @property {Number} rank - Node rank
 */

/**
 * Create a new disjoint-set node.
 *
 * @param value Node value
 * @return {DSNode} A new node with the given value.
 */
function dsNode(value) {
    return {
        value: value,
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
 */
function dsUnion(node, other) {
    node = dsFind(node);
    other = dsFind(other);
    if (node === other) {
        return;
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
 * Update disjoint-set data structure for a given link based on thumbnail hash.
 *
 * @param {Map} thumbDomainMap Domain map
 * @param {LinkInfo} info Link info
 * @param {DSNode} node Disjoint-set node for the link
 * @param {Settings} settings User settings
 */
function updateThumbMap(thumbDomainMap, info, node, settings) {
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
        // Exact hash match, merge with existing node
        dsUnion(thumbMap.get(hashStr), node);
        return;
    }
    thumbMap.set(hashStr, node);

    if (settings.maxHammingDistance > 0) {
        const bkMapKey = new Int32Array(info.thumbnailHash);
        // Merge with hash values within max radius
        for (let otherNode of bkFind(thumbMap.bkMap, bkMapKey,
                                     settings.maxHammingDistance)) {
            dsUnion(node, otherNode);
        }
        bkAdd(thumbMap.bkMap, bkMapKey, node);
    }
}

/**
 * Build a disjoint-set forest from a list of links, unifying duplicates.
 *
 * @param {LinkInfo[]} linkInfos A list of link info objects
 * @param {Settings} settings User settings
 * @return {DSNode[]} A list of disjoint-set nodes
 */
function buildDsForest(linkInfos, settings) {
    const nodes = [];
    const urlMap = new Map();
    const thumbDomainMap = new Map();
    // Create a node for each link and unify nodes with the same URL or
    // near-duplicate thumbnails.
    for (const linkInfo of linkInfos) {
        if (!linkInfo) {
            continue;
        }
        const node = dsNode(linkInfo);
        nodes.push(node);
        // Merge by URL
        if (linkInfo.url) {
            const url = linkInfo.url;
            if (urlMap.has(url)) {
                dsUnion(urlMap.get(url), node);
            } else {
                urlMap.set(url, node);
            }
        }
        // Merge by thumbnail
        if (settings.deduplicateThumbs && linkInfo.thumbnailHash) {
            updateThumbMap(thumbDomainMap, linkInfo, node, settings);
        }
    }
    return nodes;
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
    const tagline = getTagline(dupRecord.thing, pageType);
    tagline.append(' (', dupRecord.countElt, ' — ', dupRecord.linkElt, ')');
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
 * @param {String} pageType Page type
 * @param {Element} thing A link element to add as a duplicate
 */
function addDuplicate(dupRecord, thing, pageType) {
    // Update display CSS property
    thing.style.display = dupRecord.showDuplicates ? '' : 'none';
    // Reorder duplicate to come after preceding duplicate or primary
    moveThingAfter(lastItem(dupRecord.duplicates, dupRecord.thing), thing);
    // Add duplicate to record
    dupRecord.duplicates.push(thing);
    // Update primary link tagline
    if (!dupRecord.countElt) {
        initTagline(dupRecord, pageType);
    }
    const s = dupRecord.duplicates.length > 1 ? 's' : '';
    dupRecord.countElt.textContent =
        `${dupRecord.duplicates.length} duplicate${s}`;
}

/**
 * Iterate over the disjoint-set nodes and collate duplicate items.
 *
 * @param {DSNode[]} nodes A list of disjoint-set nodes
 * @param {String} pageType Page type
 * @return {DupRecord[]} A list of duplicate records.
 */
function collateDuplicates(nodes, pageType) {
    // Iterate over the forest and build a duplicate record for each tree in
    // the forest, updating the DOM as we go.
    const dupRecords = new Map();
    for (const node of nodes) {
        const linkInfo = node.value;
        const rep = dsFind(node);
        if (dupRecords.has(rep)) {
            const dupRecord = dupRecords.get(rep);
            addDuplicate(dupRecord, linkInfo.thing, pageType);
        } else {
            dupRecords.set(rep, {
                thing: linkInfo.thing,
                duplicates: [],
                showDuplicates: false,
            });
        }
    }
    // Return the list of duplicate records.
    return Array.from(dupRecords.values());
}

/**
 * Process a list of LinkInfo objects, find duplicates, and update the DOM.
 *
 * @param {LinkInfo[]} linkInfos A list of link info objects
 * @param {String} pageType Page type
 * @param {Settings} settings User settings
 * @return {DupRecord[]} An array of duplicate records.
 */
function findDuplicates(linkInfos, pageType, settings) {
    // We use a disjoint-set data structure to group links having the same url
    // or thumbnail image.
    const nodes = buildDsForest(linkInfos, settings);
    return collateDuplicates(nodes, pageType);
}

/**
 * Log duplicate stats to the console.
 *
 * @param {DupRecord[]} dupRecords An array of duplicate records
 * @param {Number} t0 Initial timestamp for performance measurement
 */
function logDupInfo(dupRecords, t0) {
    let numWithDups = 0;
    let totalDups = 0;
    for (const dupRecord of dupRecords) {
        if (dupRecord.duplicates.length > 0) {
            numWithDups += 1;
            totalDups += dupRecord.duplicates.length;
        }
    }
    const t1 = performance.now();
    if (numWithDups === 0) {
        console.log("No duplicates found", `(${t1-t0} ms)`);
    } else {
        const s1 = numWithDups > 1 ? 's' : '';
        const s2 = totalDups > 1 ? 's' : '';
        console.log(`Found ${numWithDups} item${s1}`,
                    `with ${totalDups} duplicate${s2}`,
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
        Array.from(links, (thing) => getLinkInfo(thing, pageType, settings)));
    const dupRecords = findDuplicates(linkInfos, pageType, settings);
    logDupInfo(dupRecords, t0);
}

main().catch((error) => console.error(error));
