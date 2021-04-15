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
 * Symbol for recording the original position of a link on the page. This is
 * used to keep links in order when combining duplicates.
 *
 * @constant {Symbol}
 */
const indexSymbol = Symbol('index');

/**
 * Stats object.
 *
 * @typedef {Object} Stats
 * @property {Number} numWithDups - Number of links with at least one duplicate
 * @property {Number} totalDups - Total number of duplicate links
 */

/**
 * Information about a link with duplicates.
 *
 * @property {Element} thing - Primary link
 * @property {Number} index - Index of primary link
 * @property {Element[]} duplicates - Duplicate links
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
     * @param {Element} thing Primary link element
     * @return {DupRecord} A new duplicate record, initially with no duplicates.
     */
    constructor(thing) {
        this.thing = thing;
        this.index = thing[indexSymbol];
        this.duplicates = [];
        this.showDuplicates = false;
    }

    /**
     * Merge duplicates from two duplicate records.
     *
     * @param {Element[]} duplicates First record duplicates
     * @param {Element} otherThing Primary link of second record
     * @param {Element[]} otherDuplicates Second record duplicates
     * @yields {Element} The given elements in index order.
     */
    static *mergeDupLists(duplicates, otherThing, otherDuplicates) {
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
    initTagline(pageType) {
        this.countElt = document.createElement('span');
        this.countElt.textContent = '0 duplicates';
        this.linkElt = document.createElement('a');
        this.linkElt.textContent = this.showDuplicates ? 'hide' : 'show';
        this.linkElt.href = '#';
        const dupRecord = this;
        this.linkElt.onclick = (() => {
            dupRecord.showDuplicates = !dupRecord.showDuplicates;
            dupRecord.linkElt.textContent =
                dupRecord.showDuplicates ? 'hide' : 'show';
            for (const thing of dupRecord.duplicates) {
                thing.style.display = dupRecord.showDuplicates ? '' : 'none';
            }
            return false;
        });
        this.taglineElt = document.createElement('span');
        this.taglineElt.append(' (', this.countElt, ' — ', this.linkElt, ')');
        const tagline = getTagline(this.thing, pageType);
        tagline.append(this.taglineElt);
    }

    /**
     * Merge another duplicate record into this.
     *
     * @param {DupRecord} other Record to merge
     * @param pageType Page type
     * @param {Stats} stats Stats object
     */
    merge(other, pageType, stats) {
        // Update stats
        if (!this.duplicates.length) {
            stats.numWithDups += 1;
        }
        if (other.duplicates.length) {
            stats.numWithDups -= 1;
        }
        stats.totalDups += 1;

        // Merge duplicate lists
        const duplicates = new Array(
            this.duplicates.length + other.duplicates.length + 1);
        let i = 0;
        let prev = this.thing;
        for (const dup of DupRecord.mergeDupLists(
                this.duplicates, other.thing, other.duplicates)) {
            // Update display CSS property
            dup.style.display = this.showDuplicates ? '' : 'none';
            // Reorder duplicate to come after preceding duplicate or primary
            moveThingAfter(prev, dup);
            // Add duplicate to new array
            duplicates[i++] = dup;
            prev = dup;
        }
        this.duplicates = duplicates;

        // Update primary link tagline
        if (!this.taglineElt) {
            this.initTagline(pageType);
        }
        const s = duplicates.length > 1 ? 's' : '';
        this.countElt.textContent =
            `${duplicates.length} duplicate${s}`;

        // Clean up other tagline
        if (other.taglineElt) {
            other.taglineElt.remove();
            delete other.taglineElt;
            delete other.countElt;
            delete other.linkElt;
        }
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
 * Unify disjoint-set nodes and update the associated duplicate records.
 *
 * @param {DSNode} A disjoint-set node
 * @param {DSNode} Another disjoint-set node
 * @param {String} pageType Page type
 * @param {Stats} stats Stats object
 */
function mergeDuplicates(node1, node2, pageType, stats) {
    node1 = node1.find();
    node2 = node2.find();
    if (node1 === node2) {
        return;
    }
    const newNode = node1.union(node2);

    let dupRecord = node1.dupRecord;
    let otherRecord = node2.dupRecord;
    if (otherRecord.index < dupRecord.index) {
        const tmp = dupRecord;
        dupRecord = otherRecord;
        otherRecord = tmp;
    }
    dupRecord.merge(otherRecord, pageType, stats);

    delete node1.dupRecord;
    delete node2.dupRecord;
    newNode.dupRecord = dupRecord;
}

/** Class used to find and coalesce duplicate links. */
class DuplicateFinder {

    /**
     * @param {String} pageType Page type
     * @param {Settings} settings User settings
     */
    constructor(pageType, settings) {
        this.pageType = pageType;
        this.urlMap = new Map();
        this.deduplicateThumbs = settings.deduplicateThumbs;
        if (this.deduplicateThumbs) {
            this.partitionByDomain = settings.partitionByDomain;
            if (this.partitionByDomain) {
                this.thumbDomainMap = new Map();
            } else {
                this.thumbMap = new Map();
            }
            this.maxHammingDistance = settings.maxHammingDistance;
            this.useBk = settings.maxHammingDistance > 0;
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
     * @param {Stats} stats Stats object
     */
    updateThumbMap(linkInfo, node, stats) {
        const thumbMap = this.getThumbMap(linkInfo.domain);
        const hashStr = bufToString(linkInfo.thumbnailHash);
        if (thumbMap.has(hashStr)) {
            // Exact hash match, merge with existing node.
            mergeDuplicates(thumbMap.get(hashStr), node, this.pageType, stats);
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
                mergeDuplicates(node, otherNode, this.pageType, stats);
            }
            thumbMap.bkMap.add(bkMapKey, node);
        }
    }

    /**
     * Add a new link to the disjoint-set forest and merge duplicates.
     *
     * @param {LinkInfo} linkInfo Information about a link
     * @param {Stats} stats Stats object
     */
    processLink(linkInfo, stats) {
        if (!linkInfo) {
            return;
        }
        const node = new DSNode();
        node.dupRecord = new DupRecord(linkInfo.thing);
        // Merge by URL
        if (linkInfo.url) {
            const urlMap = this.urlMap;
            const url = linkInfo.url;
            if (urlMap.has(url)) {
                mergeDuplicates(urlMap.get(url), node, this.pageType, stats);
            } else {
                urlMap.set(url, node);
            }
        }
        // Merge by thumbnail
        if (this.deduplicateThumbs && linkInfo.thumbnailHash) {
            this.updateThumbMap(linkInfo, node, stats);
        }
    }
}

/**
 * Log duplicate stats to the console.
 *
 * @param {Stats} stats Stats object
 * @param {Number} linkInfoMs Duration to get link info
 * @param {Number} findDupsMs Duration to find duplicates
 */
function logStats(stats, linkInfoMs, findDupsMs) {
    const perfStr = (`(process=${linkInfoMs} ms, dedup=${findDupsMs} ms)`);
    if (stats.numWithDups === 0) {
        console.log("No duplicates found", perfStr);
    } else {
        const s1 = stats.numWithDups > 1 ? 's' : '';
        const s2 = stats.totalDups > 1 ? 's' : '';
        console.log(`Found ${stats.numWithDups} item${s1}`,
                    `with ${stats.totalDups} duplicate${s2}`,
                    perfStr);
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
    const dupFinder = new DuplicateFinder(pageType, settings);
    // Get info for all links before merging duplicates
    const linkInfos = await Promise.all(
        Array.from(links, (thing, index) => {
            thing[indexSymbol] = index;
            return getLinkInfo(thing, pageType, settings);
        }));
    const t1 = performance.now();
    const stats = {numWithDups: 0, totalDups: 0};
    for (const linkInfo of linkInfos) {
        dupFinder.processLink(linkInfo, stats);
    }
    const t2 = performance.now();
    logStats(stats, t1-t0, t2-t1);
}

main().catch((error) => console.error(error));
