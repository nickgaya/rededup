#! /bin/bash

download() {
    local url="$1"
    local dest="$2"
    status=$(curl -s -o "${dest}" -w '%{http_code}' "${url}")
    if [ "${status}" != 200 ]; then
        echo "Failed to download ${url}: ${status}" >&2
        return 1
    fi
}

set -eu
set -o pipefail

FILES=(
    LICENSE.txt
    manifest.json
    dct.js
    phash.js
    rededup.js
    settings.html
    settings.js
)
FF_FILES=(
    "${FILES[@]}"
    icons/icon.svg
)
CH_FILES=(
    "${FILES[@]}"
    background.js
    bgshim.js
    icons/icon16.png
    icons/icon48.png
    icons/icon128.png
)

# From https://github.com/mozilla/webextension-polyfill/releases/
PF_URL='https://unpkg.com/webextension-polyfill@0.7.0/dist/browser-polyfill.js'

name="rededup"
version="$(jq -r '.version' <manifest.json)"
vname="${name}-${version}"

mkdir -p build/ artifacts/

build_dir="build/${vname}"
rm -rf "${build_dir}"
mkdir "${build_dir}"

# Firefox
echo "Firefox"
ff_build_dir="${build_dir}/firefox"
rsync -R "${FF_FILES[@]}" "${ff_build_dir}"
(cd "${ff_build_dir}" && zip "${vname}-fx.zip" "${FF_FILES[@]}")
mv -i "${ff_build_dir}/${vname}-fx.zip" "artifacts/${vname}-fx.zip"

# Chrome
echo "Chrome"
ch_build_dir="${build_dir}/chrome"
rsync -R "${CH_FILES[@]}" "${ch_build_dir}"
## Apply manifest changes for chrome
jq -f chrome.jq <manifest.json >"${ch_build_dir}/manifest.json"
## Add browser-polyfill.js
download "${PF_URL}" "${ch_build_dir}/browser-polyfill.js"
### Remove source map comment, see
### https://bugs.chromium.org/p/chromium/issues/detail?id=212374
sed -i.bak '\://# sourceMappingURL=.*:d' "${ch_build_dir}/browser-polyfill.js"
CH_FILES+=(browser-polyfill.js)
sed -e 's/\(\s*\)<!-- \(.*browser-polyfill.js.*\) -->/\1\2/g' \
    <settings.html >"${ch_build_dir}/settings.html"
## Package
(cd "${ch_build_dir}" && zip "${vname}-ch.zip" "${CH_FILES[@]}")
mv -i "${ch_build_dir}/${vname}-ch.zip" "artifacts/${vname}-ch.zip"

echo "Success"
