"use strict";

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
    LEGACY_SEARCH_PAGE: 'legacy search page',
});

/**
 * @typedef {Object} PageInfo
 * @property {?Element} container - Link container
 * @property {String} pageType - Page type
 */

/**
 * Get info for getting links from the current page
 * @return {PageInfo} An object containing the page type and link container
 */
function getPageInfo() {
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
            container: document.body.querySelector('#siteTable'),
            pageType: PageType.LISTING_PAGE,
        };
    } else if (document.body.classList.contains('combined-search-page')) {
        // Combined search page
        const containers = document.body.querySelectorAll(
            '.search-result-group');
        return {
            container: containers[containers.length - 1],
            pageType: PageType.SEARCH_PAGE,
        };
    } else if (document.body.classList.contains('search-page')) {
        // Legacy search page
        return {
            container: document.body.querySelector('#siteTable'),
            pageType: PageType.LEGACY_SEARCH_PAGE,
        };
    } else {
        // Other page such as post submission form, wiki page, etc.
        console.debug("Other page type", document.body.classList);
        return {pageType: "other"};
    }
}

/**
 * Symbol for recording the original position of a link on the page. This is
 * used to keep links in order when combining duplicates.
 *
 * @constant {Symbol}
 */
const indexSymbol = Symbol('index');

/** Index to assign to next link. */
let nextIndex = 0;

/**
 * Get links from the given container.
 *
 * @param {Element} container - Element containing links
 * @param {String} pageType - Page type
 * @return {Element[]} List of links.
 */
function getLinks(container, pageType) {
    let links;
    switch (pageType) {
        case PageType.LISTING_PAGE:
            links = container.querySelectorAll('.thing.link');
            break;
        case PageType.SEARCH_PAGE:
            links = container.querySelectorAll('.search-result-link');
            break;
        default:
            throw "Invalid page type";
    }
    for (const link of links) {
        link[indexSymbol] = nextIndex++;
    }
    return links;
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
        case PageType.LEGACY_SEARCH_PAGE:
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
        case PageType.LEGACY_SEARCH_PAGE:
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


    if (settings.shouldProcessThumbnail(linkInfo.domain)) {
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
                    const spanElt = document.createElement('span');
                    spanElt.classList.add('rededup-hash');
                    spanElt.append(' [', hashElt, ']');
                    getTagline(thing, pageType).append(spanElt);
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
 * Empty <div class="clearleft"></div> element.
 *
 * @constant {Element}
 */
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
 * Information about a link with duplicates.
 *
 * @property {Element[]} links - List of links
 * @property {Number} index - Index of primary link
 * @property {Boolean} showDuplicates - Whether to show or hide duplicate links
 * @property {Element} taglineElt - Element within the primary link tagline
 *    containing the duplicate count and visibility toggle
 * @property {Element} countElt - Element for displaying the duplicate count
 * @property {Element} linkElt - Element for toggling duplicate visibility
 */
class DupRecord {
    /**
     * Create a new duplicate record.
     *
     * @param {Element} link - Primary link
     */
    constructor(link) {
        this.links = [link]
        this.index = link[indexSymbol];
        this.showDuplicates = false;
    }

    /**
     * Add elements to a post's tagline and update the duplicate record.
     *
     * @param {DupRecord} dupRecord Information about the link
     * @param {String} pageType Page type
     */
    initTagline(pageType) {
        this.countElt = document.createElement('span');
        this.countElt.textContent = '0 duplicates';
        this.linkElt = document.createElement('a');
        this.linkElt.classList.add('rededup-toggle');
        this.linkElt.textContent = this.showDuplicates ? 'hide' : 'show';
        this.linkElt.href = '#';
        const dupRecord = this;
        this.linkElt.onclick = (() => {
            dupRecord.showDuplicates = !dupRecord.showDuplicates;
            dupRecord.linkElt.textContent =
                dupRecord.showDuplicates ? 'hide' : 'show';
            for (let i = 1; i < dupRecord.links.length; i++) {
                dupRecord.links[i].style.display =
                    dupRecord.showDuplicates ? '' : 'none';
            }
            return false;
        });
        this.taglineElt = document.createElement('span');
        this.taglineElt.classList.add('rededup-tagline');
        this.taglineElt.append(
            ' (', this.countElt, ' \u2014 ', this.linkElt, ')');
        const tagline = getTagline(this.links[0], pageType);
        tagline.append(this.taglineElt);
    }

    updateLinks(links, pageType) {
        if (links[0] !== this.links[0]) {
            throw "Primary link mismatch";
        }
        this.links = links;
        let prev = links[0];
        for (let i = 1; i < links.length; i++) {
            const link = links[i];
            link.style.display = this.showDuplicates ? '' : 'none';
            moveThingAfter(prev, link);
            prev = link;
        }
        if (!this.taglineElt) {
            this.initTagline(pageType);
        }
        const numDuplicates = links.length - 1;
        const s = numDuplicates === 1 ? '' : 's';
        this.countElt.textContent = `${numDuplicates} duplicate${s}`;
    }
}

/**
 * A disjoint-set node.
 *
 * @property {?DSNode} parent - Parent node
 * @property {Number} rank - Node rank
 */
class DSNode {
    /** Create a new disjoint-set node. */
    constructor() {
        this.parent = null;
        this.rank = 0;
    }

    /**
     * Find the representative of a disjoint-set node.
     *
     * @return {DSNode} The representative for this node.
     */
    find() {
        let node = this;
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
     * @param {DSNode} other A node to merge with this node
     * @return {DSNode} The representative after merging.
     */
    union(other) {
        let node = this.find();
        other = other.find();
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
 * @property {Int32Array} key - An image hash as a pair of 32-bit integers
 * @property {DSNode} value - Disjoint-set node for the image hash
 * @property {BKNode[]} children - A sparse array of child nodes, indexed by
 *     distance.
 */
class BKNode {
    /**
     * Create a new BK-tree node.
     *
     * @param {Int32Array} key Node key
     * @param {DSNode} value Node value
     */
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.children = new Array(65);
    }

    /**
     * Add a key-value pair in a BK-tree map. If the given key already exists,
     * do nothing.
     *
     * @param {Int32Array} key Map key
     * @param {DSNode} value Map value
     */
    add(key, value) {
        let bkNode = this;
        while (true) {
            const dist = hdist(bkNode.key, key);
            if (dist === 0) {
                return;  // Key matches current node, no-op
            }
            const child = bkNode.children[dist];
            if (!child) {
                bkNode.children[dist] = new BKNode(key, value);
                return;
            }
            bkNode = child;
        }
    }

    /**
     * Find all node values within a given distance for the given key.
     *
     * @param {Int32Array} key Map key
     * @param {Number} maxDist Maximum Hamming distance, inclusive.
     * @yields {DSNode} Values for all keys within the given Hamming distance
     *     of the specified key.
     */
    *findAll(key, maxDist) {
        const dist = hdist(this.key, key);
        if (dist <= maxDist) {
            yield this.value;
        }
        const i0 = Math.abs(dist - maxDist);
        const i1 = Math.min(dist + maxDist, 64);
        for (let i = i0; i <= i1; i += 1) {
            const child = this.children[i];
            if (child) {
                yield* child.findAll(key, maxDist);
            }
        }
    }
}

/**
 * Recursively flatten an array that may contain other arrays.
 *
 * @param arr An array
 * @yield The items of the array and any nested arrays
 */
function* flatten(arr) {
    for (const item of arr) {
        if (Array.isArray(item)) {
            yield* flatten(item);
        } else {
            yield item;
        }
    }
}

/**
 * Merge a pair of sorted arrays.
 *
 * @param {Array} l1 First array
 * @param {Array} l2 Second array
 * @param compareFunction Sort comparison function
 * @return {Array} The merged array.
 */
function merge2(l1, l2, compareFunction) {
    const len1 = l1.length;
    const len2 = l2.length;
    const result = new Array(len1 + len2);
    let i = 0;
    let j = 0;
    let k = 0;
    let l1_i = l1[i];
    let l2_j = l2[j];
    while (i < len1 && j < len2) {
        if (compareFunction(l1_i, l2_j) <= 0) {
            result[k++] = l1_i;
            l1_i = l1[++i];
        } else {
            result[k++] = l2_j;
            l2_j = l2[++j];
        }
    }
    while (i < len1) {
        result[k++] = l1[i++];
    }
    while (j < len2) {
        result[k++] = l2[j++];
    }
    return result;
}

/**
 * Perform a k-way merge of sorted arrays.
 *
 * @param {Array} A List of sorted lists to merge
 * @param compareFunction Sort comparison function
 * @return {Array} The merged array.
 */
function mergeK(A, compareFunction) {
    if (A.length === 0) {
        return [];
    }
    if (A.length === 1) {
        return A[0];
    }
    if (A.length === 2) {
        return merge2(A[0], A[1], compareFunction);
    }
    // Iteratively merge the two shortest lists. This creates a merge tree
    // analogous to a Huffman tree of array sizes, thereby minimizing total
    // operations.
    // Worst-case performance O(n log k)
    A.sort((l1, l2) => l1.length - l2.length);
    const A_len = A.length;
    const B_len = A_len - 1;
    const B = new Array(B_len);
    let i = 0;
    let j = 0;
    for (let k = 0; k < B_len; k++) {
        let l1;
        if (j === k) {
            l1 = A[i++];
        } else if(i === A_len) {
            l1 = B[j];
            delete B[j];
            j++;
        } else if (A[i].length <= B[j].length) {
            l1 = A[i++];
        } else {
            l1 = B[j];
            delete B[j];
            j++;
        }
        let l2;
        if (j === k) {
            l2 = A[i++];
        } else if(i === A_len) {
            l2 = B[j];
            delete B[j];
            j++;
        } else if (A[i].length <= B[j].length) {
            l2 = A[i++];
        } else {
            l2 = B[j];
            delete B[j];
            j++;
        }
        B[k] = merge2(l1, l2, compareFunction);
    }
    return B[B_len-1];
}

/**
 * Function to compare two links by index
 * @param {Element} link1 First link
 * @param {Element} link2 Second link
 * @return {Number} A number indicating the relative order of the two links.
 */
function linkIndexComparator(link1, link2) {
    return link1[indexSymbol] - link2[indexSymbol];
}

/**
 * Stats object.
 *
 * @typedef {Object} Stats
 * @property {Number} numWithDups - Number of links with at least one duplicate
 * @property {Number} totalDups - Total number of duplicate links
 */

/** Class used to find and coalesce duplicate links. */
class DuplicateFinder {

    /**
     * @param {String} pageType Page type
     * @param {Settings} settings User settings
     */
    constructor(pageType, settings) {
        this.pageType = pageType;
        this.urlMap = new Map();
        this.partitionByDomain = settings.partitionByDomain;
        if (this.partitionByDomain) {
            this.thumbDomainMap = new Map();
        } else {
            this.thumbMap = new Map();
        }
        this.maxHammingDistance = settings.maxHammingDistance;
        this.useBk = settings.maxHammingDistance > 0;
        this.stats = {numWithDups: 0, totalDups: 0};
    }

    /**
     * Unify disjoint-set nodes and track which dupRecords need to be merged.
     *
     * @param {DSNode} A disjoint-set node
     * @param {DSNode} Another disjoint-set node
     * @param {Set<DSNode>} merged Set of merged nodes to update
     */
    mergeDsNodes(node1, node2, merged) {
        node1 = node1.find();
        node2 = node2.find();
        if (node1 === node2) {
            return;  // No-op, nodes already merged
        }
        const newNode = node1.union(node2);

        const dupRecord1 = node1.dupRecord;
        const dupRecord2 = node2.dupRecord;
        delete node1.dupRecord;
        delete node2.dupRecord;
        // Set value to a list for now, will merge later
        newNode.dupRecord = [dupRecord1, dupRecord2];

        // Update merged set
        merged.delete(node1);
        merged.delete(node2);
        merged.add(newNode);
    }

    /**
     * Find duplicates for a given link based on the URL.
     *
     * @param {LinkInfo} linkInfo Link info
     * @param {DSNode} node Disjoint-set node for the link
     * @param {Set<DSNode>} merged Set of merged nodes to update
     */
    updateUrlMap(linkInfo, node, merged) {
        const urlMap = this.urlMap;
        const url = linkInfo.url;
        if (urlMap.has(url)) {
            this.mergeDsNodes(urlMap.get(url), node, merged);
        } else {
            urlMap.set(url, node);
        }
    }

    /**
     * Get a map from thumbnail hash values to disjoint-set nodes.
     *
     * @param {String} domain Link domain
     * @return {Map} Map of thumbnail hashes for the given domain.
     */
    getThumbMap(domain) {
        if (this.partitionByDomain) {
            const domainKey = domain || '';
            let thumbMap = this.thumbDomainMap.get(domainKey);
            if (!thumbMap) {
                thumbMap = new Map();
                this.thumbDomainMap.set(domainKey, thumbMap);
            }
            return thumbMap;
        } else {
            return this.thumbMap;
        }
    }

    /**
     * Find duplicates for a given link based on thumbnail hash.
     *
     * @param {LinkInfo} linkInfo Link info
     * @param {DSNode} node Disjoint-set node for the link
     * @param {Set<DSNode>} merged Set of merged nodes to update
     */
    updateThumbMap(linkInfo, node, merged) {
        const thumbMap = this.getThumbMap(linkInfo.domain);
        const hashStr = bufToString(linkInfo.thumbnailHash);
        if (thumbMap.has(hashStr)) {
            // Exact hash match, merge with existing node.
            this.mergeDsNodes(thumbMap.get(hashStr), node, merged);
            return;
        }
        thumbMap.set(hashStr, node);
        if (this.useBk) {
            const bkMapKey = new Int32Array(linkInfo.thumbnailHash);
            if (!thumbMap.bkMap) {
                thumbMap.bkMap = new BKNode(bkMapKey, node);
                return;
            }
            // Merge with hash values within max radius
            for (let otherNode of thumbMap.bkMap.findAll(
                     bkMapKey, this.maxHammingDistance)) {
                this.mergeDsNodes(node, otherNode, merged);
            }
            thumbMap.bkMap.add(bkMapKey, node);
        }
    }

    /**
     * Add a new link to the disjoint-set forest and update merge information.
     *
     * @param {LinkInfo} linkInfo Information about a link
     * @param {Set<DSNode>} merged Set of merged nodes to update
     */
    processLink(linkInfo, merged) {
        if (!linkInfo) {
            return;
        }
        const node = new DSNode();
        node.dupRecord = new DupRecord(linkInfo.thing);
        // Merge by URL
        if (linkInfo.url) {
            this.updateUrlMap(linkInfo, node, merged);
        }
        // Merge by thumbnail
        if (linkInfo.thumbnailHash) {
            this.updateThumbMap(linkInfo, node, merged);
        }
    }

    /**
     * Add a list of links to the disjoint-set forest and merge duplicates.
     *
     * @param {LinkInfo[]} linkInfos List of link info objects
     * @return {Stats} stats Batch stats
     */
    processLinks(linkInfos) {
        const stats = this.stats;
        const batchStats = {numWithDups: 0, totalDups: 0};
        let startIndex, endIndex;
        // Find first non-null element
        for (let i = 0; i < linkInfos.length; i++) {
            if (linkInfos[i]) {
                startIndex = linkInfos[i].thing[indexSymbol] - i;
                endIndex = startIndex + linkInfos.length;
                break;
            }
        }
        // First, update the discrete-set data structure for each new link
        // and compile a set of merged nodes
        const merged = new Set();
        for (const linkInfo of linkInfos) {
            this.processLink(linkInfo, merged);
        }
        // For each merged node, merge all associated duplicate records
        // and update the DOM.
        for (const node of merged.values()) {
            const dupRecords = Array.from(flatten(node.dupRecord));
            let primaryRecord = dupRecords[0];
            let links = [[]]
            for (const dupRecord of dupRecords) {
                if (dupRecord.index < primaryRecord.index) {
                    primaryRecord = dupRecord;
                }
                if (dupRecord.links.length === 1) {
                    links[0].push(dupRecord.links[0]);
                } else {
                    links.push(dupRecord.links);
                }
            }
            links[0].sort(linkIndexComparator);
            // Merge lists of links in index order
            const mergedLinks = mergeK(links, linkIndexComparator);
            // Update DOM and record stats for logging
            for (const dupRecord of dupRecords) {
                const hasDups = dupRecord.links.length > 1;
                const inBatch = (dupRecord.index >= startIndex
                                 && dupRecord.index <= endIndex);
                if (dupRecord === primaryRecord) {
                    if (!hasDups) {
                        stats.numWithDups++;
                        if (inBatch) {
                            batchStats.numWithDups++;
                        }
                    }
                    dupRecord.updateLinks(mergedLinks, this.pageType);
                } else {
                    if (hasDups) {
                        stats.numWithDups--;
                    }
                    stats.totalDups++;
                    if (inBatch) {
                        batchStats.totalDups++;
                    }
                    if (dupRecord.taglineElt) {
                        dupRecord.taglineElt.remove();
                    }
                }
            }
            node.dupRecord = primaryRecord;
        }
        return batchStats;
    }
}

/**
 * Log duplicate stats to the console.
 *
 * @param {Stats} stats Stats object
 * @param {BatchStats} stats - Stats object for batch
 * @param {Number} linkInfoMs Duration to get link info
 * @param {Number} findDupsMs Duration to find duplicates
 */
function logStats(stats, batchStats, linkInfoMs, findDupsMs) {
    if (batchStats.totalDups === 0) {
        console.log("No duplicates found (process=%s ms, dedup=%s ms)",
                    linkInfoMs, findDupsMs);
    } else if (batchStats.totalDups === stats.totalDups) {
        // First batch with duplicates
        console.log("Found %d item%s with %d duplicate%s "
                    + "(process=%s ms, dedup=%s ms)",
                    stats.numWithDups, stats.numWithDups === 1 ? '' : 's',
                    stats.totalDups, stats.totalDups === 1 ? '' : 's',
                    linkInfoMs, findDupsMs);
    } else {
        console.log("Found %d duplicate%s, "
                    + "total %d item%s with %d duplicate%s "
                    + "(process=%s ms, dedup=%s ms)",
                    batchStats.totalDups,
                    batchStats.totalDups === 1 ? '' : 's',
                    stats.numWithDups, stats.numWithDups === 1 ? '' : 's',
                    stats.totalDups, stats.totalDups === 1 ? '' : 's',
                    linkInfoMs, findDupsMs);
    }
}

/**
 * Process a batch of links and coalesce duplicates.
 *
 * @param {Element[]} links - List of links to process
 * @param {String} pageType - Page type
 * @param {Boolean} first - Whether this is the first batch
 * @param {DuplicateFinder} dupFinder - Duplicate finder
 * @param {Settings} settings - User settings
 */
async function processBatch(links, pageType, first, dupFinder, settings) {
    const s = (links.length === 1) ? '' : 's';
    if (first) {
        console.log("Processing %d link%s (%s)", links.length, s, pageType);
    } else {
        console.log("Processing %d additional link%s", links.length, s);
    }
    const t0 = performance.now();
    // Get info for all links before merging duplicates
    const linkInfos = await Promise.all(
        Array.from(links, thing => getLinkInfo(thing, pageType, settings)));
    const t1 = performance.now();
    const batchStats = dupFinder.processLinks(linkInfos);
    const t2 = performance.now();
    logStats(dupFinder.stats, batchStats, t1-t0, t2-t1);
}

/**
 * Main content script entry point. Queries the DOM for links and performs
 * duplicate processing.
 */
async function main() {
    const {container, pageType} = getPageInfo();
    if (!container) {
        console.log("Not processing page", `(${pageType})`);
        return;
    }
    const settings = await getSettings();
    const dupFinder = new DuplicateFinder(pageType, settings);
    const links = getLinks(container, pageType);
    if (!links.length) {
        console.log("No links found", `(${pageType})`);
    } else {
        processBatch(links, pageType, true, dupFinder, settings)
            .catch((error) => console.error(error));
    }

    // Monitor container for new links to process.
    const observer = new MutationObserver(mutationList => {
        for (const mutation of mutationList) {
            // RES/NER adds each new page of links within an anonymous div
            // element, so query for links within each added child node.
            for (const child of mutation.addedNodes) {
                const links = getLinks(child, pageType);
                if (!links.length) {
                    continue;
                }
                processBatch(links, pageType, false, dupFinder, settings)
                    .catch((error) => console.error(error));
            }
        }
    });
    observer.observe(container, {childList: true});
}

main().catch((error) => console.error(error));
