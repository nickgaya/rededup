/** Return a promise containing a data url for a file's contents. */
function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    })
}

/** Create an image element from a file and wait for it to load. */
function loadImageFile(file) {
    if (!file.type.startsWith("image/")) {
        return Promise.reject(`Invalid file type: ${file.type}`);
    }
    return fileToDataURL(file).then(loadImage);
}

/** Convert an image to a grayscale image of the given dimensions. */
function showGrayscale(img, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const imgPixels = imgData.data;
    for (let k = 0; k < imgPixels.length; k += 4) {
        imgPixels[k] = imgPixels[k+1] = imgPixels[k+2] = 
            Math.round((imgPixels[k] + imgPixels[k+1] + imgPixels[k+2]) / 3);
        imgPixels[k+3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/** Scale a canvas to a specified size. */
function scaleCanvas(canvas, width, height) {
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const ctx = scaled.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return scaled;
}

/** Convert a buffer to a hex string. */
function bufToHex(buffer) {
    return Array.from(new Uint8Array(buffer),
                      (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Create a text span representing an image hash value. */
function hashTextElement(hash, other) {
    const code = document.createElement('code');
    if (other) {
        const hashHex = bufToHex(hash);
        const otherHex = bufToHex(other);
        let i = 0;
        let length = hashHex.length;
        while (i < length) {
            if (hashHex.charAt(i) !== otherHex.charAt(i)) {
                const red = document.createElement('span');
                red.style = 'color: red';
                do {
                    red.append(hashHex.charAt(i));
                } while (++i < length
                         && hashHex.charAt(i) != otherHex.charAt(i));
                code.append(red);
            } else {
                code.append(hashHex.charAt(i++));
            }
        }
        code.normalize();
    } else {
        code.textContent = bufToHex(hash);
    }
    const span = document.createElement('span');
    span.append('[', code, ']');
    return span;
}

/** Create a black-and-white image representing an image hash value. */
function hashBitmap(hash, other) {
    const bytes = new Uint8Array(hash);
    const oBytes = other ? new Uint8Array(other) : null;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = bytes.length;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const imgPixels = imgData.data;
    for (let i = 0; i < bytes.length; i++) {
        const k = i * 32;
        let hb = bytes[i];
        let ob = other ? oBytes[i] : null;
        for (let j = 7; j >= 0; j--) {
            const k2 = k + 4*j;
            const bit = hb & 1;
            hb >>= 1;
            if (other) {
                const obit = ob & 1;
                ob >>= 1;
                if (bit === obit) {
                    imgPixels[k2] = imgPixels[k2+1] = imgPixels[k2+2] =
                        bit ? 0 : 255;
                } else {
                    imgPixels[k2] = bit ? 127: 255;
                    imgPixels[k2+1] = imgPixels[k2+2] = 0;
                }
            } else {
                imgPixels[k2] = imgPixels[k2+1] = imgPixels[k2+2] =
                    bit ? 0 : 255;
            }
            imgPixels[k2+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

function bitCount32(n) {
  n = n - ((n >> 1) & 0x55555555)
  n = (n & 0x33333333) + ((n >> 2) & 0x33333333)
  return ((n + (n >> 4) & 0xF0F0F0F) * 0x1010101) >> 24
}

function hdist(h1, h2) {
    const a1 = new Int32Array(h1);
    const a2 = new Int32Array(h2);
    return bitCount32(a1[0] ^ a2[0]) + bitCount32(a1[1] ^ a2[1]);
}

/** Create a div with textual and visual representations of a hash value. */
function hashDiv(hash, other) {
    const div = document.createElement('div');
    div.append(wrap(hashTextElement(hash, other), 'div'),
               wrap(scaleCanvas(hashBitmap(hash, other), 32, 32), 'div'));
    if (other) {
        div.append(wrap(`Hamming distance: ${hdist(hash, other)}`, 'div'));
    }
    return div;
}

/** Wrap an element in a new element with the given tag name. */
function wrap(element, tag) {
    const wrapper = document.createElement(tag);
    wrapper.append(element);
    return wrapper;
}

/** Wrap an element in a <td> element. */
function td(element) {
    return wrap(element, 'td');
}

// 32x32 DCT matrix
// We normalize the coefficients such that the matrix is orthogonal.
const DCT = new Array(32);
{
    const P_64 = Math.PI / 64;
    DCT[0] = new Float64Array(32).fill(0.25 * (2**-0.5));
    for (let r = 1; r < 32; r += 1) {
        const DCT_r = DCT[r] = new Float64Array(32);
        const RP_64 = r * P_64;
        for (let c = 0; c < 32; c += 1) {
            DCT_r[c] = Math.cos((2*c + 1) * RP_64) * 0.25;
        }
    }
}

/** Compute the inverse DCT of a 32x32 matrix. */
function inverseDct32(Y) {
    // Compute M'YM, where M is the DCT matrix
    const YM = new Array(32);
    for (let r = 0; r < 32; r++) {
        const YM_r = YM[r] = new Float64Array(32);
        const Y_r = Y[r];
        for (let c = 0; c < 32; c++) {
            let s = 0;
            for (let i = 0; i < 32; i++) {
                s += Y_r[i] * DCT[i][c];
            }
            YM_r[c] = s;
        }
    }
    const X = new Array(32);
    for (let r = 0; r < 32; r++) {
        const X_r = X[r] = new Float64Array(32);
        for (let c = 0; c < 32; c++) {
            let s = 0;
            for (let i = 0; i < 32; i++) {
                s += DCT[i][r] * YM[i][c];
            }
            X_r[c] = s;
        }
    }
    return X;
}

/** Create an image representing the values of a matrix visualized as grayscale
 *  values in the range [0, 255].
 */
function matrixToGrayscale(M) {
    const height = M.length;
    const width = M[0].length;
    // Find the extreme values of M
    let min = max = M[0][0];
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < height; c++) {
            min = Math.min(min, M[r][c]);
            max = Math.max(max, M[r][c]);
        }
    }
    const range = max-min;
    // Create image with normalized values
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const imgPixels = imgData.data;
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
            const k = (r * width + c) * 4;
            imgPixels[k] = imgPixels[k+1] = imgPixels[k+2] =
                Math.round((M[r][c] - min) / range * 255);
            imgPixels[k+3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/** Convert a buffer to an iterable of bit values in big-endian order. */
function* hashBits(hash) {
    for (let hbyte of new Uint8Array(hash)) {
        for (let b = 7; b >= 0; b--) {
            yield (hbyte >>> b) & 1;
        }
    }
}

/** Create a visualization of a DCT hash value. */
function visualizeDctHash(dctHash) {
    const bitsGen = hashBits(dctHash);
    const Y = new Array(32);
    for (let r = 0; r < 32; r++) {
        Y[r] = new Float64Array(32);
    }
    for (let i = 1; i <= 10; i++) {
        for (let j = 0; j <= i; j++) {
            if (i === 10 && j === 5) {
                continue;
            }
            const bit = bitsGen.next().value;
            // We apply exponential decay to the coefficients according to
            // taxicab distance from the origin to give the lower-frequency
            // coefficients a bit more weight. This leads to a more "readable"
            // visualization.
            Y[j][i-j] = (bit ? 1 : -1) * Math.exp(-i/3);
        }
    }
    const X = inverseDct32(Y);
    return matrixToGrayscale(X);
}

function visualizeWaveletHash(hash) {
    const M = new Array(8);
    const M_data = new Float64Array(8*8);
    let o = 0;
    for (let r = 0; r < 8; r++) {
        M[r] = M_data.subarray(o, o+=8);
    }
    const bitsGen = hashBits(hash);
    for (let i = 0; i < 8; i++) {
        const M_i = M[i];
        for (let j = 0; j < 8; j++) {
            const x = [1, 0.5, 0.25, 0.25,
                       0.125, 0.125, 0.125, 0.125][Math.max(i, j)];
            M_i[j] = bitsGen.next().value ? x : -x;
        }
    }
    idwt(M);
    return matrixToGrayscale(M);
}

/** Main entry point for the demo. */
function main() {
    const input = document.getElementById('input');
    const inputReplace = document.getElementById('inputReplace');
    const output = document.getElementById('output');
    const compareNone = document.getElementById('compareNone');

    const trMap = new WeakMap();
    let compare;

    /** Process a file and add its information to the output table. */
    function processImage(img) {
        if (img.width > 128 || img.height > 128) {
            const r = 128 / Math.max(img.width, img.height);
            img.width = Math.floor(img.width * r);
            img.height = Math.floor(img.height * r);
        }
        const tr = document.createElement('tr');
        const hashes = {};
        trMap.set(tr, hashes);

        // Scaled image
        tr.append(td(img));

        // Difference hash
        tr.append(td(scaleCanvas(showGrayscale(img, 8, 8), 32, 32)));
        const diffHash = hashes.diffHash =
            getImageHash(img, HashFunction.DIFFERENCE_HASH);
        tr.append(td(hashDiv(diffHash, compare?.diffHash)));

        // DCT hash
        tr.append(td(scaleCanvas(showGrayscale(img, 32, 32), 128, 128)));
        const dctHash = hashes.dctHash =
            getImageHash(img, HashFunction.DCT_HASH);
        tr.append(td(hashDiv(dctHash, compare?.dctHash)));
        tr.append(td(scaleCanvas(visualizeDctHash(dctHash), 128, 128)));

        // Wavelet hash
        const waveletHash = hashes.waveletHash =
            getImageHash(img, HashFunction.WAVELET_HASH);
        tr.append(td(hashDiv(waveletHash, compare?.waveletHash)));
        tr.append(td(scaleCanvas(visualizeWaveletHash(waveletHash),
                                 128, 128)));

        // Radio button for comparison
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'compare';
        radio.addEventListener('click', (event) => {
            compare = hashes;
            recomputeComparisons();
        });
        tr.append(td(radio));

        const remove = document.createElement('button');
        remove.textContent = '\u2715';
        remove.addEventListener('click', (event) => {
            tr.remove();
            if (compare === hashes) {
                compareNone.checked = true;
                compare = null;
                recomputeComparisons();
            }
        });
        tr.append(td(remove));

        output.append(tr);
    }

    function recomputeComparison(tr) {
        const hashes = trMap.get(tr);
        if (!hashes) {
            return;  // Header row
        }

        if (compare === hashes) {
            // Primary row
            tr.children[2].replaceWith(td(hashDiv(hashes.diffHash)));
            tr.children[4].replaceWith(td(hashDiv(hashes.dctHash)));
            tr.children[6].replaceWith(td(hashDiv(hashes.waveletHash)));
        } else {
            tr.children[2].replaceWith(
                td(hashDiv(hashes.diffHash, compare?.diffHash)));
            tr.children[4].replaceWith(
                td(hashDiv(hashes.dctHash, compare?.dctHash)));
            tr.children[6].replaceWith(
                td(hashDiv(hashes.waveletHash, compare?.waveletHash)));
        }
    }

    function recomputeComparisons() {
        for (const tr of output.children) {
            recomputeComparison(tr);
        }
    }

    /** Clear the output table. */
    function clearOutput() {
        while (output.lastElementChild !== output.firstElementChild) {
            output.removeChild(output.lastElementChild);
        }
        compareNone.checked = true;
        compare = null;
    }

    /** Handle all files of the file input element. */
    function handleFiles() {
        if (input.files.length && inputReplace.checked) {
            clearOutput();
        }
        for (const file of input.files) {
            loadImageFile(file).then(processImage)
                .catch((error) => console.warn(file, error));
        }
    }

    /** Add example image. */
    function loadExample() {
        loadImage('gaugin.jpg').then(processImage)
            .catch((error) => console.warn(error));
    }

    /** Clear the input and output elements. */
    function reset() {
        input.value = '';
        clearOutput();
        loadExample();
    }

    input.addEventListener('change', handleFiles);
    compareNone.addEventListener('click', () => {
        compare = null;
        recomputeComparisons();
    });

    document.getElementById('reset').addEventListener('click', reset);

    loadExample();
    // If user reloads the page there may be files already selected
    handleFiles();
}

document.addEventListener("DOMContentLoaded", main);
