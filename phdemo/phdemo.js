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
function hashTextElement(hash) {
    const code = document.createElement('code');
    code.textContent = bufToHex(hash);
    const span = document.createElement('span');
    span.append('[', code, ']');
    return span;
}

/** Create a black-and-white image representing an image hash value. */
function hashBitmap(hash) {
    const bytes = new Uint8Array(hash);
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = bytes.length;
    const ctx = canvas.getContext('2d');
    const imgData = ctx.createImageData(canvas.width, canvas.height);
    const imgPixels = imgData.data;
    for (let i = 0; i < bytes.length; i++) {
        const k = i * 32;
        let hb = bytes[i];
        for (let j = 7; j >= 0; j--) {
            const k2 = k + 4*j;
            imgPixels[k2] = imgPixels[k2+1] = imgPixels[k2+2] =
                (hb & 1) ? 0 : 255;
            imgPixels[k2+3] = 255;
            hb >>= 1;
        }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
}

/** Create a div with textual and visual representations of a hash value. */
function hashDiv(hash) {
    const div = document.createElement('div');
    div.append(wrap(hashTextElement(hash), 'div'),
               wrap(scaleCanvas(hashBitmap(hash), 32, 32), 'div'));
    return div;
}

/** Wrap an element in a new element with the given tag name. */
function wrap(element, tag) {
    const wrapper = document.createElement(tag);
    wrapper.appendChild(element);
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

/** Process a file and add its information to the output table. */
async function handleFile(file) {
    const img = await loadImageFile(file);
    if (img.width > 128 || img.height > 128) {
        const r = 128 / Math.max(img.width, img.height);
        img.width = Math.floor(img.width * r);
        img.height = Math.floor(img.height * r);
    }
    const tr = document.createElement('tr');

    // Scaled image
    tr.append(td(img));

    // Difference hash
    tr.append(td(scaleCanvas(showGrayscale(img, 8, 8), 32, 32)));
    const diffHash = getImageHash(img, 'diffHash');
    tr.append(td(hashDiv(diffHash)));

    // DCT hash
    tr.append(td(scaleCanvas(showGrayscale(img, 32, 32), 128, 128)));
    const dctHash = getImageHash(img, 'dctHash');
    tr.append(td(hashDiv(dctHash)));
    tr.append(td(scaleCanvas(visualizeDctHash(dctHash), 128, 128)));

    document.getElementById('output').append(tr);
}

/** Handle all files of the file input element. */
function handleFiles() {
    const input = document.getElementById('input');
    for (const file of input.files) {
        handleFile(file).catch((error) => console.warn(file, error));
    }
}

/** Clear the input and output elements. */
function reset() {
    document.getElementById('input').value = '';
    const output = document.getElementById('output');
    while (output.lastElementChild !== output.firstElementChild) {
        output.removeChild(output.lastElementChild);
    }
}

/** Main entry point for the demo. */
function main() {
    const input = document.getElementById('input');
    input.addEventListener('change', handleFiles);
    // If user reloads the page there may be files already selected
    handleFiles();

    document.getElementById('reset').addEventListener('click', reset);
}

document.addEventListener("DOMContentLoaded", main);
