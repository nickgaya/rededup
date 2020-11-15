// Compute the first 11 coefficients of the DCT-II on 32 inputs
// This is based on the fast DCT algorithm outlined here:
// https://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.118.3056&rep=rep1&type=pdf#page=34
// We unroll all loops / recursion and eliminate computations that are not
// required to compute the first 11 coefficients.
const fdct32_11 = function() {
    const C0 = Math.cos(Math.PI / 4);
    const C1 = 0.5 / Math.cos(Math.PI * 1 / 8);
    const C2 = 0.5 / Math.cos(Math.PI * 3 / 8);
    const C3 = 0.5 / Math.cos(Math.PI * 1 / 16);
    const C4 = 0.5 / Math.cos(Math.PI * 3 / 16);
    const C5 = 0.5 / Math.cos(Math.PI * 5 / 16);
    const C6 = 0.5 / Math.cos(Math.PI * 7 / 16);
    const C7 = 0.5 / Math.cos(Math.PI * 1 / 32);
    const C8 = 0.5 / Math.cos(Math.PI * 3 / 32);
    const C9 = 0.5 / Math.cos(Math.PI * 5 / 32);
    const C10 = 0.5 / Math.cos(Math.PI * 7 / 32);
    const C11 = 0.5 / Math.cos(Math.PI * 9 / 32);
    const C12 = 0.5 / Math.cos(Math.PI * 11 / 32);
    const C13 = 0.5 / Math.cos(Math.PI * 13 / 32);
    const C14 = 0.5 / Math.cos(Math.PI * 15 / 32);
    const C15 = 0.5 / Math.cos(Math.PI * 1 / 64);
    const C16 = 0.5 / Math.cos(Math.PI * 3 / 64);
    const C17 = 0.5 / Math.cos(Math.PI * 5 / 64);
    const C18 = 0.5 / Math.cos(Math.PI * 7 / 64);
    const C19 = 0.5 / Math.cos(Math.PI * 9 / 64);
    const C20 = 0.5 / Math.cos(Math.PI * 11 / 64);
    const C21 = 0.5 / Math.cos(Math.PI * 13 / 64);
    const C22 = 0.5 / Math.cos(Math.PI * 15 / 64);
    const C23 = 0.5 / Math.cos(Math.PI * 17 / 64);
    const C24 = 0.5 / Math.cos(Math.PI * 19 / 64);
    const C25 = 0.5 / Math.cos(Math.PI * 21 / 64);
    const C26 = 0.5 / Math.cos(Math.PI * 23 / 64);
    const C27 = 0.5 / Math.cos(Math.PI * 25 / 64);
    const C28 = 0.5 / Math.cos(Math.PI * 27 / 64);
    const C29 = 0.5 / Math.cos(Math.PI * 29 / 64);
    const C30 = 0.5 / Math.cos(Math.PI * 31 / 64);

    // Preallocate buffer
    const Y = new Array(32);

    function fdct32_11(X) {
        Y[0] = X[0] + X[31];
        Y[1] = X[1] + X[30];
        Y[2] = X[2] + X[29];
        Y[3] = X[3] + X[28];
        Y[4] = X[4] + X[27];
        Y[5] = X[5] + X[26];
        Y[6] = X[6] + X[25];
        Y[7] = X[7] + X[24];
        Y[8] = X[8] + X[23];
        Y[9] = X[9] + X[22];
        Y[10] = X[10] + X[21];
        Y[11] = X[11] + X[20];
        Y[12] = X[12] + X[19];
        Y[13] = X[13] + X[18];
        Y[14] = X[14] + X[17];
        Y[15] = X[15] + X[16];
        Y[16] = (X[0] - X[31]) * C15;
        Y[17] = (X[1] - X[30]) * C16;
        Y[18] = (X[2] - X[29]) * C17;
        Y[19] = (X[3] - X[28]) * C18;
        Y[20] = (X[4] - X[27]) * C19;
        Y[21] = (X[5] - X[26]) * C20;
        Y[22] = (X[6] - X[25]) * C21;
        Y[23] = (X[7] - X[24]) * C22;
        Y[24] = (X[8] - X[23]) * C23;
        Y[25] = (X[9] - X[22]) * C24;
        Y[26] = (X[10] - X[21]) * C25;
        Y[27] = (X[11] - X[20]) * C26;
        Y[28] = (X[12] - X[19]) * C27;
        Y[29] = (X[13] - X[18]) * C28;
        Y[30] = (X[14] - X[17]) * C29;
        Y[31] = (X[15] - X[16]) * C30;
        X[0] = Y[0] + Y[15];
        X[1] = Y[1] + Y[14];
        X[2] = Y[2] + Y[13];
        X[3] = Y[3] + Y[12];
        X[4] = Y[4] + Y[11];
        X[5] = Y[5] + Y[10];
        X[6] = Y[6] + Y[9];
        X[7] = Y[7] + Y[8];
        X[8] = (Y[0] - Y[15]) * C7;
        X[9] = (Y[1] - Y[14]) * C8;
        X[10] = (Y[2] - Y[13]) * C9;
        X[11] = (Y[3] - Y[12]) * C10;
        X[12] = (Y[4] - Y[11]) * C11;
        X[13] = (Y[5] - Y[10]) * C12;
        X[14] = (Y[6] - Y[9]) * C13;
        X[15] = (Y[7] - Y[8]) * C14;
        Y[0] = X[0] + X[7];
        Y[1] = X[1] + X[6];
        Y[2] = X[2] + X[5];
        Y[3] = X[3] + X[4];
        Y[4] = (X[0] - X[7]) * C3;
        Y[5] = (X[1] - X[6]) * C4;
        Y[6] = (X[2] - X[5]) * C5;
        Y[7] = (X[3] - X[4]) * C6;
        X[0] = Y[0] + Y[3];
        X[1] = Y[1] + Y[2];
        X[2] = (Y[0] - Y[3]) * C1;
        X[3] = (Y[1] - Y[2]) * C2;
        Y[0] = X[0] + X[1];
        Y[2] = X[2] + X[3];
        Y[3] = (X[2] - X[3]) * C0;
        X[0] = Y[0];
        X[1] = Y[2] + Y[3];
        X[4] = Y[4] + Y[7];
        X[5] = Y[5] + Y[6];
        X[6] = (Y[4] - Y[7]) * C1;
        X[7] = (Y[5] - Y[6]) * C2;
        Y[4] = X[4] + X[5];
        Y[6] = X[6] + X[7];
        Y[7] = (X[6] - X[7]) * C0;
        X[4] = Y[4];
        X[5] = Y[6] + Y[7];
        Y[0] = X[0];
        Y[1] = X[4] + X[5];
        Y[2] = X[1];
        Y[8] = X[8] + X[15];
        Y[9] = X[9] + X[14];
        Y[10] = X[10] + X[13];
        Y[11] = X[11] + X[12];
        Y[12] = (X[8] - X[15]) * C3;
        Y[13] = (X[9] - X[14]) * C4;
        Y[14] = (X[10] - X[13]) * C5;
        Y[15] = (X[11] - X[12]) * C6;
        X[8] = Y[8] + Y[11];
        X[9] = Y[9] + Y[10];
        X[10] = (Y[8] - Y[11]) * C1;
        X[11] = (Y[9] - Y[10]) * C2;
        Y[8] = X[8] + X[9];
        Y[10] = X[10] + X[11];
        Y[11] = (X[10] - X[11]) * C0;
        X[8] = Y[8];
        X[9] = Y[10] + Y[11];
        X[12] = Y[12] + Y[15];
        X[13] = Y[13] + Y[14];
        X[14] = (Y[12] - Y[15]) * C1;
        X[15] = (Y[13] - Y[14]) * C2;
        Y[12] = X[12] + X[13];
        Y[13] = (X[12] - X[13]) * C0;
        Y[14] = X[14] + X[15];
        Y[15] = (X[14] - X[15]) * C0;
        X[12] = Y[12];
        X[13] = Y[14] + Y[15];
        X[14] = Y[13];
        Y[8] = X[8];
        Y[9] = X[12] + X[13];
        Y[10] = X[9];
        Y[11] = X[13] + X[14];
        X[0] = Y[0];
        X[1] = Y[8] + Y[9];
        X[2] = Y[1];
        X[3] = Y[9] + Y[10];
        X[4] = Y[2];
        X[5] = Y[10] + Y[11];
        X[16] = Y[16] + Y[31];
        X[17] = Y[17] + Y[30];
        X[18] = Y[18] + Y[29];
        X[19] = Y[19] + Y[28];
        X[20] = Y[20] + Y[27];
        X[21] = Y[21] + Y[26];
        X[22] = Y[22] + Y[25];
        X[23] = Y[23] + Y[24];
        X[24] = (Y[16] - Y[31]) * C7;
        X[25] = (Y[17] - Y[30]) * C8;
        X[26] = (Y[18] - Y[29]) * C9;
        X[27] = (Y[19] - Y[28]) * C10;
        X[28] = (Y[20] - Y[27]) * C11;
        X[29] = (Y[21] - Y[26]) * C12;
        X[30] = (Y[22] - Y[25]) * C13;
        X[31] = (Y[23] - Y[24]) * C14;
        Y[16] = X[16] + X[23];
        Y[17] = X[17] + X[22];
        Y[18] = X[18] + X[21];
        Y[19] = X[19] + X[20];
        Y[20] = (X[16] - X[23]) * C3;
        Y[21] = (X[17] - X[22]) * C4;
        Y[22] = (X[18] - X[21]) * C5;
        Y[23] = (X[19] - X[20]) * C6;
        X[16] = Y[16] + Y[19];
        X[17] = Y[17] + Y[18];
        X[18] = (Y[16] - Y[19]) * C1;
        X[19] = (Y[17] - Y[18]) * C2;
        Y[16] = X[16] + X[17];
        Y[18] = X[18] + X[19];
        Y[19] = (X[18] - X[19]) * C0;
        X[16] = Y[16];
        X[17] = Y[18] + Y[19];
        X[20] = Y[20] + Y[23];
        X[21] = Y[21] + Y[22];
        X[22] = (Y[20] - Y[23]) * C1;
        X[23] = (Y[21] - Y[22]) * C2;
        Y[20] = X[20] + X[21];
        Y[22] = X[22] + X[23];
        Y[23] = (X[22] - X[23]) * C0;
        X[20] = Y[20];
        X[21] = Y[22] + Y[23];
        Y[16] = X[16];
        Y[17] = X[20] + X[21];
        Y[18] = X[17];
        Y[24] = X[24] + X[31];
        Y[25] = X[25] + X[30];
        Y[26] = X[26] + X[29];
        Y[27] = X[27] + X[28];
        Y[28] = (X[24] - X[31]) * C3;
        Y[29] = (X[25] - X[30]) * C4;
        Y[30] = (X[26] - X[29]) * C5;
        Y[31] = (X[27] - X[28]) * C6;
        X[24] = Y[24] + Y[27];
        X[25] = Y[25] + Y[26];
        X[26] = (Y[24] - Y[27]) * C1;
        X[27] = (Y[25] - Y[26]) * C2;
        Y[24] = X[24] + X[25];
        Y[26] = X[26] + X[27];
        Y[27] = (X[26] - X[27]) * C0;
        X[24] = Y[24];
        X[25] = Y[26] + Y[27];
        X[28] = Y[28] + Y[31];
        X[29] = Y[29] + Y[30];
        X[30] = (Y[28] - Y[31]) * C1;
        X[31] = (Y[29] - Y[30]) * C2;
        Y[28] = X[28] + X[29];
        Y[29] = (X[28] - X[29]) * C0;
        Y[30] = X[30] + X[31];
        Y[31] = (X[30] - X[31]) * C0;
        X[28] = Y[28];
        X[29] = Y[30] + Y[31];
        X[30] = Y[29];
        Y[24] = X[24];
        Y[25] = X[28] + X[29];
        Y[26] = X[25];
        Y[27] = X[29] + X[30];
        X[16] = Y[16];
        X[17] = Y[24] + Y[25];
        X[18] = Y[17];
        X[19] = Y[25] + Y[26];
        X[20] = Y[18];
        X[21] = Y[26] + Y[27];
        Y[0] = X[0];
        Y[1] = X[16] + X[17];
        Y[2] = X[1];
        Y[3] = X[17] + X[18];
        Y[4] = X[2];
        Y[5] = X[18] + X[19];
        Y[6] = X[3];
        Y[7] = X[19] + X[20];
        Y[8] = X[4];
        Y[9] = X[20] + X[21];
        Y[10] = X[5];
        return Y.slice(0, 11);
    }
    return fdct32_11;
}();
