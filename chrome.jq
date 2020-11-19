# JQ script to modify the manifest for Chrome

# Add background scripts
(.background |= {
  "scripts": [
    "browser-polyfill.js",
    "dct.js",
    "phash.js",
    "background.js"
  ],
  "persistent": false
})

# Update content scripts
| (.content_scripts[0].js =  [
    "browser-polyfill.js",
    "bgshim.js",
    "rededup.js"
])

# Chrome doesn't support svg icons, so use PNGs at the recommended sizes
| (.icons = {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
})
