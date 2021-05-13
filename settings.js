"use strict";

/**
 * Trie-based map.
 *
 * A trie is a type of tree used to facilitate prefix-based queries over a set
 * of strings.
 *
 * Our implementation supports three operations: adding a string to the set
 * associated with a value, removing a string from the map, and finding values
 * associated with any prefix of a given string.
 *
 * Note that in this implementation a "string" can be any iterable sequence.
 */
class TrieMap {

    /** Create a new, empty TrieMap. */
    constructor(_rank = 0) {
        this.rank = _rank;
        this.value = null;
        this.children = null;
    }

    /** Get a child node by key. */
    _get(key) {
        return this.children?.get?.(key);
    }

    /** Add a child node by key. */
    _put(key, child) {
        if (!this.children) {
            this.children = new Map();
        }
        this.children.set(key, child);
    }

    /**
     * Add a value associated with the given key sequence.
     *
     * @param {Iterable.<*>} keys Key sequence to add
     * @param {*} value Value to add
     */
    put(keys, value) {
        if (value == null) {
            throw 'Value must not be null or undefined';
        }
        let node = this;
        for (const key of keys) {
            let child = node._get(key);
            if (!child) {
                child = new TrieMap(node.rank + 1);
                node._put(key, child);
            }
            node = child;
        }
        node.value = value;
    }

    /**
     * Find all prefix matches for the given key sequence.
     *
     * @param {Iterable.<*>} keys Key sequence to look up
     * @yield {[Number, *]} For each match, a 2-element array containing the
     *     length of the matching prefix and the associated value in the map.
     *     Matches are yielded in ascending prefix length order.
     */
    *findAll(keys) {
        let node = this;
        if (node.value !== null) {
            yield [node.rank, node.value];
        }
        for (const key of keys) {
            node = node._get(key);
            if (!node) {
                break;
            }
            if (node.value !== null) {
                yield [node.rank, node.value];
            }
        }
    }

    /**
     * Find the best prefix match for the given key sequence.
     *
     * @param {Iterable.<*>} keys Key sequence to look up
     * @return {?[Number, *]} A 2-element array containing the length of the
     *     longest matching prefix and the associated value in the map. If no
     *     value is found, returns null.
     */
    find(keys) {
        let last = null;
        for (const match of this.findAll(keys)) {
            last = match;
        }
        return last;
    }

    toString(key = "") {
        const childStrings = this.children ? Array.from(
            this.children, (entry => entry[1].toString(entry[0]))) : [];
        return `[${this.rank} ${key} ${this.value} ${childStrings}]`;
    }
}

/**
 * Define a class property that is computed on first access.
 * Based on https://www.bitovi.com/blog/lazy-values-to-speed-up-your-js-app
 *
 * @param cls Class function
 * @param {String} name Property name
 * @param getFunc Function to compute property value. The function should
 *     accept a single argument, the instance to compute the property for.
 */
function setLazyProperty(cls, name, getFunc) {
    Object.defineProperty(cls.prototype, name, {
        get: function get() {
            const value = getFunc(this);
            Object.defineProperty(this, name, {value: value});
            return value;
        },
    });
}

/**
 * Domain-specific settings.
 * @typedef {Object} DomainSettings
 * @property {Boolean} deduplicateThumbs - Whether to deduplicate posts by
 *     thumbnail for this domain
 */

/**
 * User settings.
 *
 * @property {Boolean} deduplicateThumbs - Whether to deduplicate posts by
 *     thumbnail
 * @property {[String, DomainSettings[]]} domainSettings - List of
 *     [domainName, domainSettings] pairs
 * @property {String} hashFunction - Image hash function
 * @property {Number} maxHammingDistance - Maximum Hamming distance for
 *     thumbnail hash comparison
 * @property {Boolean} partitionByDomain - Whether to segregate posts by domain
 *     when checking for thumbnail duplicates
 * @property {Boolean} showHashValues - Whether to show thumbnail hash values
 *     in post taglines
 */
class Settings {
    constructor(settings) {
        Object.assign(this, settings);
    }

    /** Convert a domain name to a list of labels in hierarchical order. */
    static _domainKey(domain) {
        const labels = domain.split('.');
        if (!labels[labels.length-1]) {
            labels.pop();
        }
        labels.reverse();
        return labels;
    }

    /**
     * Check if we should process thumbnails for the given domain.
     *
     * @param {String} domain Domain to check
     * @return {Boolean} Whether we should process thumbnails for this domain.
     */
    shouldProcessThumbnail(domain) {
        domain ??= "";
        let result = this._domainCache.get(domain);
        if (result != null) {  // not null or undefined
            return result;
        }
        [, result] = this._domainTrie.find(Settings._domainKey(domain));
        this._domainCache.set(domain, result);
        return result;
    }
}

setLazyProperty(Settings, '_domainTrie', (settings) => {
    const trie = new TrieMap();
    trie.put([], settings.deduplicateThumbs);
    for (const [domain, {deduplicateThumbs}] of settings.domainSettings) {
        if (deduplicateThumbs == null) {  // null or undefined
            continue;
        }
        const domainKey = Settings._domainKey(domain);
        trie.put(domainKey, deduplicateThumbs);
    }
    return trie;
});

setLazyProperty(Settings, '_domainCache', () => new Map());

const defaultSettings = Object.freeze({
    deduplicateThumbs: true,
    domainSettings: [],
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
    let settings = defaultSettings;
    try {
        settings = await browser.storage.local.get(defaultSettings);
    } catch (error) {
        console.warn("Error fetching settings", error);
    }
    return new Settings(settings);
}
