/**
 * Image hash function enum.
 * @readonly
 * @enum {String}
 */
const HashFunction = Object.freeze({
    DIFFERENCE_HASH: 'diffHash',
    DCT_HASH: 'dctHash',
    WAVELET_HASH: 'waveletHash',
});

/**
 * Fetch data from an image URL, create an Image from the data, and return the
 * image once it has loaded.
 *
 * In order to fetch the image data the extension must have cross-domain access
 * for the source domain. In Chrome, this only works from background scripts.
 *
 * The resulting image is considered to have the same origin as the extension,
 * allowing us to draw it to a canvas and extract its pixel data without
 * violating the browser's same-origin security policy.
 *
 * @see {@link https://stackoverflow.com/questions/49013975/}
 * @see {@link https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts#XHR_and_Fetch}
 * @see {@link https://www.chromium.org/Home/chromium-security/extension-content-script-fetches}
 * @see {@link https://developer.chrome.com/extensions/xhr}
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
function* bitAppenderGen(arr) {
    let byteIndex = 0;
    let currentByte = 0;
    let bitCount = 0;
    while (true) {
        const bit = yield;
        currentByte = (currentByte << 1) | (bit ? 1 : 0);
        bitCount += 1;
        if (bitCount === 8) {
            arr[byteIndex++] = currentByte;
            currentByte = 0;
            bitCount = 0;
        }
    }
}

/**
 * Wrapper around bitAppenderGen() that starts the generator by calling its
 * next() method once.
 *
 * @param {Uint8Array} arr Array for storing results
 */
function bitAppender(arr) {
    const generator = bitAppenderGen(arr);
    // The first call to a generator's next() method starts execution.
    // Any argument passed in is discarded.
    generator.next();
    return generator;
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
            mooreCurve(3), (p) => p[0] + (8*p[1]));
    }
    const MC3 = getDiffHash._MC3;

    // Use a canvas to scale the image to 32x32, then manually downsample to
    // 8x8 by averaging. This is intended to reduce the effect of cross-browser
    // differences in image scaling behavior.
    const G = new Float64Array(64);
    {
        const imgPixels = getImagePixels(img, 32, 32);
        const stride = 32 * 4;
        for (let i = 0; i < 8; i++) {
            const i4 = i*4;
            for (let j = 0; j < 8; j++) {
                const j4 = j*4;
                let sum = 0;
                let k = i4*stride + j4;
                for (let di = 0; di < 4; di++) {
                    for (let dj = 0; dj < 4; dj++) {
                        sum += imgPixels[k] + imgPixels[k+1] + imgPixels[k+2];
                        k += 4;
                    }
                    k += stride - 16;
                }
                G[8*i + j] = sum / 48;
            }
        }
    }

    const hash = new Uint8Array(8);
    const hashGen = bitAppender(hash);
    let prev = G[MC3[63]];
    for (const p of MC3) {
        const curr = G[p];
        hashGen.next(prev < curr);
        prev = curr;
    }
    return hash.buffer;
}

/**
 * Return whether a given number is positive. +0 is treated as an infinitesimal
 * positive number.
 *
 * @param {Number} x A number
 * @return {Boolean} True if x is greater than 0 or +0
 */
function isPositive(x) {
    return x > 0 || Object.is(x, +0);
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
            hashGen.next(isPositive(D[i-j][j]));
        }
    }
    return hash.buffer;
}

function getWaveletHash(img) {
    // Populate input matrix
    const M = new Array(32);
    {
        const imgPixels = getImagePixels(img, 32, 32);
        const M_data = new Float64Array(32*32);
        let k = 0;  // pixel array offset
        let o = 0;  // M_data offset
        for (let r = 0; r < 32; r++) {
            const M_r = M[r] = M_data.subarray(o, (o+=32));
            for (let c = 0; c < 32; c++) {
                M_r[c] = imgPixels[k] + imgPixels[k+1] + imgPixels[k+2] - 384;
                k += 4;
            }
        }
    }
    // Compute the discrete wavelet transform
    dwt(M);
    // Use sign bits of upper 8x8 submatrix as hash bits
    const hash = new Uint8Array(8);
    const hashGen = bitAppender(hash);
    for (let i = 0; i < 8; i++) {
        const M_i = M[i];
        for (let j = 0; j<8; j++) {
            hashGen.next(isPositive(M_i[j]));
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
function getImageHash(img, hashFunction) {
    if (!img.complete) {
        throw "Image not complete";
    }
    if (img.naturalWidth === 0) {
        throw "Image broken";
    }

    switch (hashFunction) {
        case HashFunction.DIFFERENCE_HASH:
            return getDiffHash(img);
        case HashFunction.DCT_HASH:
            return getDctHash(img);
        case HashFunction.WAVELET_HASH:
            return getWaveletHash(img);
        default:
            throw "Invalid hash function";
    }
}

/**
 * Fetch an image and compute its hash.
 *
 * @param {String} url Source url
 * @param {String} hashFunction Hash function name
 * @return {ArrayBuffer} A buffer containing the image hash value.
 */
async function fetchImageAndGetHash(url, hashFunction) {
    const img = await fetchImage(url);
    return getImageHash(img, hashFunction);
}
