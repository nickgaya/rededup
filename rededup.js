async function fetchImage(srcUrl) {
    const resp = await fetch(srcUrl);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    return await loadImage(blobUrl);
}

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

function getImageHash(img) {
    if (!img.complete) {
        throw "Image not complete";
    }
    if (img.naturalWidth === 0) {
        throw "Image broken";
    }

    // An implementation of the "dHash" perceptual hash algorithm. The basic
    // idea is to scale the image to a small fixed size and compare grayscale
    // values between pixels to produce the bits of the hash.
    // See https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html
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

function bufToHex(buffer) {
    return Array.prototype.map.call(
        new Uint8Array(buffer),
        (b) => b.toString(16).padStart(2, '0')).join('');
}

function bufToString(buffer) {
    // Note: May not be valid UTF-16 data, but that's ok as Javascript strings
    // must support any unsigned 16-bit value
    return String.fromCharCode(...new Uint16Array(buffer));
}

async function processThumbnail(img) {
    try {
        // Need to use privileged fetch api due to same-origin policy
        // See https://stackoverflow.com/questions/49013975/
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

function initTagline(dupRecord) {
    dupRecord.taglineElt = document.createElement('span');
    dupRecord.countElt = document.createElement('span');
    dupRecord.countElt.textContent = '? duplicate(s)';
    dupRecord.linkElt = document.createElement('a');
    dupRecord.linkElt.textContent = dupRecord.showDuplicates ? 'hide' : 'show';
    dupRecord.linkElt.href = '#';
    dupRecord.linkElt.onclick = (() => {
        dupRecord.showDuplicates = !dupRecord.showDuplicates;
        dupRecord.linkElt.textContent =
            dupRecord.showDuplicates ? 'hide' : 'show';
        for (let thing of dupRecord.duplicates) {
            thing.style.display = dupRecord.showDuplicates ? '' : 'none';
        }
        return false;
    });
    dupRecord.taglineElt.append(
        ' (', dupRecord.countElt, ' — ', dupRecord.linkElt, ')');
    const tagline = dupRecord.thing.querySelector('.tagline');
    tagline.appendChild(dupRecord.taglineElt);
}

function lastItem(items, defaultValue) {
    return (items.length > 0) ? items[items.length - 1] : defaultValue;
}

function addDuplicate(dupRecord, thing) {
    if (!dupRecord.taglineElt) {
        initTagline(dupRecord);
    }
    thing.style.display = dupRecord.showDuplicates ? '' : 'none';
    lastItem(dupRecord.duplicates, dupRecord.thing).after(thing);
    dupRecord.duplicates.push(thing);
    const s = dupRecord.duplicates.length > 1 ? 's' : '';
    dupRecord.countElt.textContent =
        `${dupRecord.duplicates.length} duplicate${s}`;
}

async function findDuplicates(promises) {
    const thumbsMap = new Map();
    for (let promise of promises) {
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
        '#siteTable > .thing > .thumbnail > img');
    console.log("Processing", thumbs.length, "thumbnails");
    // Init all promises, then process results in order
    const promises = Array.from(thumbs, processThumbnail);
    findDuplicates(promises).then((thumbsMap) => {
        const t1 = performance.now();
        let numWithDups = 0;
        let totalDups = 0;
        for (let dupRecord of thumbsMap.values()) {
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
