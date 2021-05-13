"use strict";

function loadImage(img) {
    if (img.complete) {
        if (img.naturalWidth === 0) {
            return Promise.reject("Image in broken state");
        }
        return Promise.resolve(img);
    }
    // Image not yet loaded
    return new Promise((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = reject;
    });
}

async function main() {
    const img = await loadImage(document.body.querySelector('img'));
    for (const canvas of document.body.querySelectorAll('canvas')) {
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        console.log(canvas.width);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    main().catch((error) => console.error(error));
});
