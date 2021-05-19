# JQ script to modify the manifest for Chrome

# Add background scripts
(.background |= {
  "scripts": [
    "browser-polyfill.js",
    "dct.js",
    "dwt.js",
    "phash.js",
    "background.js"
  ],
  "persistent": false
})

# Update content scripts
| (.content_scripts[0].js =  [
    "browser-polyfill.js",
    "bgshim.js",
    "settings.js",
    "rededup.js"
])

# Chrome doesn't support svg icons, so use PNGs at the recommended sizes
| (.icons = {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
})

# Chrome emits a spurious warning about browser_specific_settings
| del(.browser_specific_settings)

# Add key so we can get a consistent extension id for testing purposes
| (.key = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAn0ryKXBfNTU8RVqLeQWhpHYzN7gj8NfJrd2CYVwjTVRLCLYNzoAUPB86DuWPEHX0wJ7Nao6MFNFXHNvp/heLerY2C9yiUAL7PCYWO4vwQhSEbbGaarR4DGbPcN6JBjg8RFwEdvR2Qwqt735ZHdtc3IpP+nu3JDRkA/qIGNrU38GFLgbbgenQtxrFhfbXRW7fIjudQz6pEG/rJ2LeE+BBqF5oyPNsZ1ZozgbeUKobWOrR6zou3KGkEx7850wWwBc8aINbgaNn8BtmR2pkD69MdJ9a4w+rfkDN2viSYNoytHvhz3W2GzifFQom1mH82mbJBC/TPpf7jk2b22rrq436yQIDAQAB")
