const INV_SQRT_2 = 2**-0.5;

/**
 * Compute the 1-dimensional DWT of a signal.
 *
 * @param {Float64Array} X Input vector
 * @param {Float64Array} Y Output vector
 * @param {Number} n Half input size
 */
function dwtStep(X, Y, n) {
    const A = Y.subarray(0, n);
    const D = Y.subarray(n, 2*n);
    for (let i = 0; i < n; i++) {
        // Haar wavelet
        A[i] = (X[2*i] + X[2*i + 1]) * INV_SQRT_2;
        D[i] = (X[2*i + 1] - X[2*i]) * INV_SQRT_2;
    }
}

/**
 * Compute the discrete wavelet transform of a matrix using Haar wavelets.
 * The input matrix must be square with dimension a power of two.
 *
 * @param {Float64Array[]} M input/output matrix
 */
function dwt(M) {
    const n = M.length;
    const X = new Float64Array(n);
    const Y = new Float64Array(n);
    for (let s = n/2; s >= 1; s /= 2) {
        const s2 = s*2;
        // Horizontal transform
        for (let r = 0; r < s2; r++) {
            const M_r = M[r];
            X.set(M_r.subarray(0, s2));
            dwtStep(X, M_r, s);
        }
        // Vertical transform
        for (let c = 0; c < s2; c++) {
            for (let r = 0; r < s2; r++) {
                X[r] = M[r][c];
            }
            dwtStep(X, Y, s);
            for (let r = 0; r < s2; r++) {
                M[r][c] = Y[r];
            }
        }
    }
}

/**
 * Compute the 1-dimensional inverse DWT of a signal.
 *
 * @param {Float64Array} Y Input vector
 * @param {Float64Array} X Output vector
 * @param {Number} n Half input size
 */
function idwtStep(X, Y, n) {
    const A = X.subarray(0, n);
    const D = X.subarray(n, 2*n);
    for (let i = 0; i < n; i++) {
        Y[2*i] = (A[i] - D[i]) * INV_SQRT_2;
        Y[2*i+1] = (A[i] + D[i]) * INV_SQRT_2;
    }
}

/**
 * Compute the 1-dimensional DWT of a signal.
 *
 * @param {Float64Array} X Input vector
 * @param {Float64Array} Y Output vector
 * @param {Number} n Half input size
 */
function idwt(M) {
    const n = M.length;
    const X = new Float64Array(n);
    const Y = new Float64Array(n);
    for (let s = 1; s <= n/2; s *= 2) {
        const s2 = s*2;
        // Vertical transform
        for (let c = 0; c < s2; c++) {
            for (let r = 0; r < s2; r++) {
                X[r] = M[r][c];
            }
            idwtStep(X, Y, s);
            for (let r = 0; r < s2; r++) {
                M[r][c] = Y[r];
            }
        }
        // Horizontal transform
        for (let r = 0; r < s2; r++) {
            const M_r = M[r];
            X.set(M_r.subarray(0, s2));
            idwtStep(X, M_r, s);
        }
    }
}
