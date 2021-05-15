const webdriver = require('selenium-webdriver');
const firefox = require('selenium-webdriver/firefox');

const {assert} = require('chai');

function sleep(milliseconds) {
    return new Promise((resolve, reject) => {
        setTimeout(resolve, milliseconds);
    });
}

function arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) {
        return false;
    }
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) {
            return false;
        }
    }
    return true;
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
            try {
                this.tagline = await this.element.findElement(
                    {css: '.tagline .rededup-tagline'});
            } catch (error) {
                if (error instanceof webdriver.error.NoSuchElementError) {
                    this.tagline = null;
                } else {
                    throw error;
                }
            }
        }
        return this.tagline;
    }

    async getToggle() {
        const tagline = await this.getTagline();
        return await tagline.findElement({css: '.rededup-toggle'});
    }
}

async function loadByIds(driver, ids) {
    await driver.get(`https://old.reddit.com/by_id/${ids.join(',')}`);
    // XXX: Better way to wait for the extension to run?
    await sleep(1000);
    const links = await Promise.all(
        (await driver.findElements({css: '#siteTable .link'}))
        .map(Link.fromElement))
    assert.equal(links.length, ids.length,
                 "Expect number of links to match request");
    return links;
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
    const s = (numDuplicates == 1) ? '' : 's';
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

async function verifyDuplicates(links, expected) {
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

async function deduplicateTest(driver, ids, expected) {
    const links = await loadByIds(driver, ids);
    await verifyDuplicates(links, expected);
    let idx = 0;
    for (const item of ids) {
        if (Array.isArray(item)) {
            await verifyShowHide(...links.slice(idx, idx+item.length));
            idx += item.length;
        } else {
            idx++;
        }
    }
    return links;
}

async function getVisibility(links) {
    return await Promise.all(links.map((link) => link.isVisible()));
}

suite('Selenium', function() {
    this.timeout(10000);

    let driver;

    suiteSetup(async function() {
        const options = new firefox.Options();
        if (process.env.BROWSER_GUI !== 'true') {
            options.headless();
        }

        driver = await new webdriver.Builder()
            .forBrowser('firefox')
            .setFirefoxOptions(options)
            .build();
    });

    suiteSetup(async function() {
        await driver.installAddon(process.env.REDEDUP_PATH, true);
    });

    suite('deduplication', function() {
        test('deduplicate by thumbnail', async function() {
            await deduplicateTest(driver,
                ['t3_jrjed7', 't3_jrqhj4', 't3_jo1qwh', 't3_jri2y8'],
                [['t3_jrjed7', 't3_jrqhj4', 't3_jri2y8'], 't3_jo1qwh']);
        });

        test('deduplicate by url', async function() {
            await deduplicateTest(driver,
                ['t3_jyu5b2', 't3_jysgvx', 't3_jywerx'],
                [['t3_jyu5b2', 't3_jywerx'], 't3_jysgvx']);
        });

        test('deduplicate crosspost', async function() {
            await deduplicateTest(driver,
                ['t3_jyu5b2', 't3_jyvuiz'],
                [['t3_jyu5b2', 't3_jyvuiz']]);
        });

        test('deduplicate multiple', async function() {
            const links = await deduplicateTest(driver,
                ['t3_jysgvx', 't3_jrjed7', 't3_jyu5b2', 't3_jrqhj4',
                 't3_jo1qwh', 't3_jywerx', 't3_jri2y8', 't3_jyvuiz'],
                ['t3_jysgvx',
                 ['t3_jrjed7', 't3_jrqhj4', 't3_jri2y8'],
                 ['t3_jyu5b2', 't3_jywerx', 't3_jyvuiz'],
                 't3_jo1qwh']);

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

    suiteTeardown(async function() {
        if (driver) {
            await driver.quit();
        }
    });
});
