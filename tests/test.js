"use strict";

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const {Origin} = require('selenium-webdriver/lib/input');

const {assert} = require('chai');

const fs = require('fs');
const path = require('path');
const uuid = require('uuid');

const firefoxExtensionId = '{68f0c654-5a3d-423b-b846-2b3ab68d05dd}';
const extensionUuid = uuid.v4();

const chromeExtensionId = 'dnnbdjbnhfojinfmmiiehamhkheifbbg';

const [firefoxPath, chromePath] = (() => {
    const version = process.env.REDEDUP_VERSION
        || JSON.parse(fs.readFileSync('../manifest.json')).version;
    const buildType = process.env.REDEDUP_BUILD_TYPE || 'unpacked';

    function getRededupPath(browser, envPath, suffix, ext) {
        if (envPath) {
            return envPath;
        }
        switch (buildType) {
            case 'unpacked':
                return `../build/rededup-${version}/${browser}`;
            case 'zip':
                return `../artifacts/rededup-${version}-${suffix}.zip`;
            case 'signed':
                return `../artifacts/rededup-${version}-${suffix}.${ext}`;
            default:
                throw new Error(`Invalid build type: ${buildType}`);
        }
    }

    return [
        getRededupPath('firefox', process.env.REDEDUP_PATH_FX, 'fx', 'xpi'),
        getRededupPath('chrome', process.env.REDEDUP_PATH_CH, 'ch', 'crx'),
    ].map(pth => path.resolve(pth));
})();

function getBrowsers() {
    return (process.env.SELENIUM_BROWSER || 'firefox,chrome')
        .split(',')
        .map(s => s.trim());
}

for (const browserSpec of getBrowsers()) {
    const browser = browserSpec.split(':', 3)[0];

    suite(`${browser} tests`, function() {
        this.timeout(10000);

        let driver;

        suiteSetup(function() {
            switch (browser) {
                case 'firefox':
                    console.debug("firefoxPath:", firefoxPath);
                    break;
                case 'chrome':
                    console.debug("chromePath:", chromePath);
                    break;
            }
        });

        // Create a new driver per test as recommended by the Selenium docs
        // https://www.selenium.dev/documentation/en/guidelines_and_recommendations/fresh_browser_per_test/
        setup(async function() {
            process.env.SELENIUM_BROWSER = browserSpec;
            switch (browser) {
                case 'firefox':
                    await createFirefoxDriver();
                    break;
                case 'chrome':
                    await createChromeDriver();
                    break;
                default:
                    throw new Error(`Unknown browser: ${browser}`);
            }
        });

        teardown(async function() {
            if (driver) {
                await driver.quit();
            }
        });

        async function createFirefoxDriver() {
            const firefoxOptions = new firefox.Options();
            if (process.env.HEADLESS === 'true') {
                firefoxOptions.headless();
            }
            firefoxOptions.setPreference(
                'extensions.webextensions.uuids',
                JSON.stringify(
                    {[firefoxExtensionId]: extensionUuid}));

            driver = await new webdriver.Builder()
                .setFirefoxOptions(firefoxOptions)
                .build();

            if (firefoxPath.endsWith('.zip') || firefoxPath.endsWith('.xpi')) {
                await driver.installAddon(firefoxPath, true);
            } else {
                // XXX: The installAddon method does not currently support
                // unpacked extensions, so we use the low-level command API
                // https://github.com/SeleniumHQ/selenium/issues/8357
                const command = require(
                    'selenium-webdriver/lib/command');
                await driver.execute(new command.Command('install addon')
                    .setParameter('path', firefoxPath)
                    .setParameter('temporary', true));
            }
        }

        async function createChromeDriver() {
            const chromeOptions = new chrome.Options();
            // Note: Chrome doesn't currently support extensions in headless
            // mode, so ignore process.env.HEADLESS
            // https://stackoverflow.com/questions/45372066/
            if (chromePath.endsWith('.zip') || chromePath.endsWith('.crx')) {
                chromeOptions.addExtensions(chromePath);
                // XXX: Workaround for a bug with chrome options
                // https://github.com/SeleniumHQ/selenium/issues/6676
                const symbols = require('selenium-webdriver/lib/symbols');
                chromeOptions[symbols.serialize]();
            } else {
                chromeOptions.addArguments(`--load-extension=${chromePath}`)
            }

            driver = await new webdriver.Builder()
                .setChromeOptions(chromeOptions)
                .build();
        }

        suite('page type', function() {
            test('front page', async function() {
                await testListingPage('/');
            });

            test('subreddit', async function() {
                await testListingPage('/r/news');
            });

            test('multireddit', async function() {
                await testListingPage('/r/news+worldnews');
            });

            test('user overview', async function() {
                await testListingPage('/u/Andromeda321');
            });

            test('user submissions', async function() {
                await testListingPage('/u/Andromeda321/submitted/');
            });

            test('comments page', async function() {
                await testSkippedPage('/r/news/comments/njxwnb',
                                      'single page');
            });

            test('duplicates page', async function() {
                await testSkippedPage('/r/news/duplicates/njxwnb',
                                      'single page');
            });

            test('new reddit', async function() {
                await testSkippedPage('https://www.reddit.com',
                                      'no body class');
            });

            test('search page', async function() {
                await testSearchPage('/search?q=example');
            });

            test('legacy search page', async function() {
                await testListingPage(
                    '/search?feature=legacy_search&q=example');
            });

            function testListingPage(url) {
                return testPageWithLinks(url, 'listing page',
                    '#siteTable .link');
            }

            function testSearchPage(url) {
                return testPageWithLinks(url, 'search page',
                    '.search-result-listing .search-result-link');
            }

            async function testPageWithLinks(url, pageType, selector) {
                await driver.get(resolve(url));
                const debugInfo = await waitForExtension();
                assert.equal(debugInfo.pageType, pageType);
                const links = await Promise.all(
                    (await driver.findElements({css: selector}))
                    .map(Link.fromElement));
                assert.isAbove(links.length, 0, "Expect at least one link");
                assert.equal(debugInfo.numLinks, links.length,
                             "Expect extension to find all links");
                assert.isNotNull(debugInfo.stats,
                                 "Expect debugInfo to contain stats");
                const observedStats = {numWithDups: 0, totalDups: 0};
                let i = 0;
                while (i < links.length) {
                    const link = links[i++];
                    // Link either has no duplicates, or is primary link with
                    // duplicates -- in either case, should be visible
                    assert(await link.isVisible(),
                           `Expect link ${link.id} to be visible`);
                    const tagline = await link.getTagline();
                    if (tagline !== null) {
                        observedStats.numWithDups++;
                        const numDups = await link.getDupCount();
                        assert.isAbove(numDups, 0,
                                       "Expect at least one duplicate for "
                                       + `link with tagline: ${link.id}`);
                        observedStats.totalDups += numDups;
                        await verifyLinkWithDuplicates(link, numDups);
                        const dupLinks = [];
                        for (let j = 0; j < numDups; j++) {
                            const dupLink = links[i++];
                            dupLinks.push(dupLink);
                            await verifyLinkHidden(dupLink);
                        }
                        await verifyShowHide(link, ...dupLinks);
                    }
                }
                assert.deepEqual(debugInfo.stats, observedStats,
                                 "Expect stats to match observed");
            }

            async function testSkippedPage(url, pageType) {
                await driver.get(resolve(url));
                const debugInfo = await waitForExtension();
                assert.equal(debugInfo.pageType, pageType);
                assert(debugInfo.ignored, "Expect page to be ignored");
            }

            function resolve(urlOrPath) {
                return new URL(urlOrPath, 'https://old.reddit.com').href;
            }
        });

        suite('deduplication', function() {
            test('deduplicate by thumbnail', async function() {
                await deduplicateTest(
                    ['t3_jrjed7', 't3_jrqhj4', 't3_jo1qwh', 't3_jri2y8'],
                    [['t3_jrjed7', 't3_jrqhj4', 't3_jri2y8'], 't3_jo1qwh'],
                    true);
            });

            test('deduplicate by url', async function() {
                await deduplicateTest(
                    ['t3_jyu5b2', 't3_jysgvx', 't3_jywerx'],
                    [['t3_jyu5b2', 't3_jywerx'], 't3_jysgvx'],
                    true);
            });

            test('deduplicate crosspost', async function() {
                await deduplicateTest(
                    ['t3_jyu5b2', 't3_jyvuiz'],
                    [['t3_jyu5b2', 't3_jyvuiz']],
                    true);
            });

            test('deduplicate multiple', async function() {
                const links = await deduplicateTest(
                    ['t3_jysgvx', 't3_jrjed7', 't3_jyu5b2', 't3_jrqhj4',
                     't3_jo1qwh', 't3_jywerx', 't3_jri2y8', 't3_jyvuiz'],
                    ['t3_jysgvx',
                     ['t3_jrjed7', 't3_jrqhj4', 't3_jri2y8'],
                     ['t3_jyu5b2', 't3_jywerx', 't3_jyvuiz'],
                     't3_jo1qwh'],
                    true);

                // Verify that different toggle links function independently
                const toggle1 = await links[1].getToggle();
                const toggle2 = await links[4].getToggle();

                let hidden1 = true;
                let hidden2 = true;

                async function verifyState() {
                    const state = {
                        toggle1: await toggle1.getText(),
                        toggle2: await toggle2.getText(),
                        visibility: await getVisibility(links),
                    };
                    assert.deepEqual(state, {
                        toggle1: hidden1 ? 'show' : 'hide',
                        toggle2: hidden2 ? 'show' : 'hide',
                        visibility: [true, true, !hidden1, !hidden1,
                                     true, !hidden2, !hidden2, true],
                    }, "Expect state to match");
                }

                async function click1() {
                    await toggle1.click();
                    hidden1 = !hidden1;
                    verifyState()
                }

                async function click2() {
                    await toggle1.click();
                    hidden2 = !hidden2;
                    verifyState()
                }

                await verifyState();
                await click1();
                await click2();
                await click1();
                await click2();
                await click2();
            });
        });

        suite('settings', function() {

            test('deduplicate by', async function() {
                // Posts should be collated
                await deduplicateTest(
                    ['t3_jrjed7', 't3_jrqhj4',],
                    [['t3_jrjed7', 't3_jrqhj4']]);

                // Select "Deduplicate posts by URL only"
                await openSettingsPage();
                const elt = await driver.findElement({id: 'ddByUrlOnly'});
                await elt.click();

                // Now posts should NOT be collated
                await deduplicateTest(
                    ['t3_jrjed7', 't3_jrqhj4',],
                    ['t3_jrjed7', 't3_jrqhj4']);
            });

            test('domain overrides', async function() {
                // Posts should be collated
                await deduplicateTest(
                    ['t3_narqjh', 't3_na423x', 't3_nas73l'],
                    [['t3_narqjh', 't3_na423x', 't3_nas73l']]);

                // Disable thumbnail processing for a domain
                await openSettingsPage();
                let elt = await driver.findElement(
                    {id: 'domainSettingsButton'});
                await elt.click();
                elt = await driver.findElement({id: 'domainInputText'});
                await elt.sendKeys('independent.co.uk');
                elt = await driver.findElement({id: 'domainInputButton'});
                await elt.click();

                // Now posts should be collated by URL but not thumbnail
                await deduplicateTest(
                    ['t3_narqjh', 't3_na423x', 't3_nas73l'],
                    [['t3_narqjh', 't3_nas73l'], 't3_na423x']);
            });

            for (const [name, eltId] of [['dct', 'dctHash'],
                                         ['difference', 'diffHash'],
                                         ['wavelet', 'waveletHash']]) {
                test(`${name} hash function`, async function() {
                    // Select hash function
                    await openSettingsPage();
                    const elt = await driver.findElement({id: eltId});
                    await elt.click();

                    // Verify posts are collated
                    await deduplicateTest(
                        ['t3_k7rhax', 't3_k7rdve'],
                        [['t3_k7rhax', 't3_k7rdve']]);
                });
            }

            test('hamming distance', async function() {
                // Posts should all be collated
                await deduplicateTest(
                    ['t3_it6czg', 't3_it6el1', 't3_it8ric'],
                    [['t3_it6czg', 't3_it6el1', 't3_it8ric']]);

                await openSettingsPage();
                const elt = await driver.findElement(
                    {id: 'maxHammingDistance'});
                const {width} = await elt.getRect();
                const actions = driver.actions();
                await actions.move({origin: elt, x:0, y:0})
                             .press()
                             .move({origin: Origin.POINTER,
                                    x:Math.floor(-width/2), y:0})
                             .release()
                             .perform();
                assert.equal(await elt.getAttribute('value'), '0');

                // One post should now be separate from the other two
                await deduplicateTest(
                    ['t3_it6czg', 't3_it6el1', 't3_it8ric'],
                    [['t3_it6czg', 't3_it6el1'], 't3_it8ric']);
            });

            test('partition by domain', async function() {
                // Posts with different domains should NOT be collated by
                // default
                await deduplicateTest(
                    ['t3_jyymza', 't3_jyyy2a'],
                    ['t3_jyymza', 't3_jyyy2a']);

                await openSettingsPage();
                const elt = await driver.findElement(
                    {id: 'partitionByDomain'});
                await elt.click();

                // Posts should now be collated
                await deduplicateTest(
                    ['t3_jyymza', 't3_jyyy2a'],
                    [['t3_jyymza', 't3_jyyy2a']]);
            });

            test('show hash values', async function() {
                await openSettingsPage();
                const elt = await driver.findElement({id: 'showHashValues'});
                await elt.click();

                const [debugInfo, links] = await loadByIds(
                    ['t3_jyu5b2', 't3_ncjf1w']);
                await verifyDuplicates(debugInfo, links,
                                       ['t3_jyu5b2', 't3_ncjf1w']);

                assert.isNull(await links[0].getHash(),
                              "Expect no thumbnail hash element for post "
                              + "without thumbnail");

                const hashElt = await links[1].getHash();
                assert.isNotNull(hashElt,
                                 "Expect thumbnail hash for post with "
                                 + "thumbnail");
                // Use textContent to preserve whitespace
                assert.match(await hashElt.getAttribute('textContent'),
                             /^ \[[0-9a-f]{16}\]$/,
                             "Expect hash text to be 16 hex digits in "
                             + "brackets");
            });

            async function openSettingsPage() {
                await driver.get({
                    firefox: `moz-extension://${extensionUuid}`,
                    chrome: `chrome-extension://${chromeExtensionId}`,
                }[browser] + '/options/index.html');
            }
        });

        /** Wait for the extension to initialize. */
        function waitForExtension() {
            return driver.wait(async () => {
                const result = await getDebugInfo();
                assert.isOk(result);
                if (result.timeout) {
                    return null;
                }
                assert.isUndefined(result.error, "getDebugInfo() error");
                const debugInfo = result.debugInfo;
                assert.isOk(debugInfo);
                assert.isUndefined(debugInfo.initError, "Error in main()");
                return debugInfo.initialized
                    && !debugInfo.pending
                    && debugInfo;
            }, 5000);
        }

        function getDebugInfo() {
            return driver.executeAsyncScript(function() {
                'use strict';
                const callback = arguments[0];
                try {
                    let timeoutId;
                    function listener(event) {
                        if (event.source === window
                                && event.data
                                && event.data.type === 'rededup.debugInfo') {
                            window.clearTimeout(timeoutId);
                            window.removeEventListener('message', listener);
                            callback({debugInfo: event.data.debugInfo});
                        }
                    }
                    window.addEventListener('message', listener);
                    timeoutId = window.setTimeout(() => {
                        window.removeEventListener('message', listener);
                        callback({timeout: true});
                    }, 100);
                    window.postMessage({type: 'rededup.getDebugInfo'}, '*');
                } catch (error) {
                    callback({error: error.message});
                }
            });
        }

        async function deduplicateTest(ids, expected, showHide = false) {
            const [debugInfo, links] = await loadByIds(ids);
            await verifyDuplicates(debugInfo, links, expected);
            if (showHide) {
                let idx = 0;
                for (const item of ids) {
                    if (Array.isArray(item)) {
                        await verifyShowHide(
                            ...links.slice(idx, idx+item.length));
                        idx += item.length;
                    } else {
                        idx++;
                    }
                }
            }
            return links;
        }

        async function loadByIds(ids) {
            await driver.get(`https://old.reddit.com/by_id/${ids.join(',')}`);
            const debugInfo = await waitForExtension();
            assert.equal(debugInfo.pageType, 'listing page');
            assert.equal(debugInfo.numLinks, ids.length);
            const links = await Promise.all(
                (await driver.findElements({css: '#siteTable .link'}))
                .map(Link.fromElement));
            assert.equal(links.length, ids.length,
                         "Expect number of links to match request");
            return [debugInfo, links];
        }
    });
}

class Link {
    constructor(id, element) {
        this.id = id;
        this.element = element;
    }

    static async fromElement(element) {
        const linkId = await element.getAttribute('data-fullname');
        return new Link(linkId, element);
    }

    async isVisible() {
        return await this.element.isDisplayed();
    }

    async getTagline() {
        if (this.tagline === undefined) {
            this.tagline = await eltOrNull(this.element.findElement(
                {css: '.rededup-tagline'}));
        }
        return this.tagline;
    }

    async getDupCount() {
        const tagline = await this.getTagline();
        const countElt = await tagline.findElement(
            {css: '.rededup-dup-count'});
        return parseInt(await countElt.getText(), 10);
    }

    async getToggle() {
        const tagline = await this.getTagline();
        return await tagline.findElement({css: '.rededup-toggle'});
    }

    async getHash() {
        return await eltOrNull(this.element.findElement(
                {css: '.rededup-hash'}));
    }
}

function eltOrNull(promise) {
    return promise.catch((error) => {
        if (error instanceof webdriver.error.NoSuchElementError) {
            return null;
        } else {
            throw error;
        }
    });
}

async function verifyDuplicates(debugInfo, links, expected) {
    const expectedStats = {numWithDups: 0, totalDups: 0};
    for (const item of expected) {
        if (Array.isArray(item)) {
            expectedStats.numWithDups++;
            expectedStats.totalDups += (item.length - 1);
        }
    }
    assert.deepEqual(debugInfo.stats, expectedStats,
                     "Expect stats to match expected");

    let i = 0;
    for (const item of expected) {
        let link = links[i++];
        if (Array.isArray(item)) {
            // Item with duplicates
            const [primary, ...duplicates] = item;
            assert.equal(link.id, primary, `Expect link ${i+1} has id`);
            await verifyLinkWithDuplicates(link, duplicates.length);
            for (const dup of duplicates) {
                link = links[i++];
                assert.equal(link.id, dup, `Expect link ${i+1} has id`);
                await verifyLinkHidden(link);
            }
        } else {
            assert.equal(link.id, item, `Expect link ${i+1} has id`);
            await verifyLinkNoDuplicates(link);
        }
    }
}

async function verifyLinkNoDuplicates(link) {
    assert((await link.isVisible()),
           `Expect link ${link.id} is visible`);
    assert.isNull((await link.getTagline()),
                  `Expect link ${link.id} has no tagline`);
}

async function verifyLinkWithDuplicates(link, numDuplicates) {
    assert((await link.isVisible()),
           `Expect link ${link.id} is visible`);
    const tagline = await link.getTagline();
    assert.isNotNull(tagline, `Expect link ${link.id} has tagline`);
    const s = (numDuplicates === 1) ? '' : 's';
    const expectedText = `(${numDuplicates} duplicate${s} \u2014 show)`;
    assert.equal(await tagline.getText(), expectedText,
                 `Expect link ${link.id} tagline text matches`);
}

async function verifyLinkHidden(link) {
    assert(!(await link.isVisible()),
           `Expect link ${link.id} is hidden`);
    assert.isNull((await link.getTagline()),
                  `Expect link ${link.id} has no tagline`);
}

async function verifyShowHide(link, ...duplicateLinks) {
    const toggle = await link.getToggle();
    assert.equal(await toggle.getText(), 'show',
                 `Expect toggle text for link ${link.id}`);

    await toggle.click();
    assert(await link.isVisible(),
           `Expect primary link ${link.id} to remain visible`);
    for (const dupLink of duplicateLinks) {
        assert(await dupLink.isVisible(),
               `Expect duplicate link ${dupLink.id} to be visible`);
    }
    assert.equal(await toggle.getText(), 'hide',
                 `Expect updated toggle text for link ${link.id}`);

    await toggle.click();
    assert(await link.isVisible(),
           `Expect primary link ${link.id} to remain visible`);
    for (const dupLink of duplicateLinks) {
        assert(!(await dupLink.isVisible()),
               `Expect duplicate link ${dupLink.id} to be hidden`);
    }
    assert.equal(await toggle.getText(), 'show',
                 `Expect updated toggle text for link ${link.id}`);
}

async function getVisibility(links) {
    return await Promise.all(links.map((link) => link.isVisible()));
}
