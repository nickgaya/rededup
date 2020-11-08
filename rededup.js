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

function getImageHash(img) {
    if (!img.complete) {
        throw "Image not complete";
    }
    if (img.naturalWidth === 0) {
        throw "Image broken";
    }
    // "Difference hash" algorithm
    // https://www.hackerfactor.com/blog/index.php?/archives/529-Kind-of-Like-That.html
    const canvas = document.createElement('canvas');
    canvas.width = 9;
    canvas.height = 8;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 9, 8);
    const imgData = ctx.getImageData(0, 0, 9, 8);
    const imgPixels = imgData.data;
    let hash = new Uint8Array(8);
    let b = 0;
    let h = 0;
    let c = 0;
    for (let i = 0; i < 288; i += 36) {
        let p = (imgPixels[i] + imgPixels[i+1] + imgPixels[i+2]) / 3;
        for (let j = 0; j < 32; j += 4) {
            const q = (imgPixels[i+j+4] + imgPixels[i+j+5] + imgPixels[i+j+6]) / 3;
            h = (h << 1) | ((p < q) ? 1 : 0);
            c += 1;
            if (c === 8) {
                hash[b] = h;
                b += 1;
                h = 0;
                c = 0;
            }
            p = q;
        }
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
