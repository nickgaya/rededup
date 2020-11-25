#! /bin/bash

usage() {
    echo "Usage: $0 [-h] [-f|-c] [-p]" >&2
    echo "    -h   Print this message and exit" >&2
    echo "    -f   Build for firefox only" >&2
    echo "    -c   Build for chrome only" >&2
    echo "    -p   Package extension as .zip file" >&2
}

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
    settings.js
    options/index.html
    options/index.js
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

ff=true
ch=true
pkg=false

while getopts ':hfcp' opt; do
    case "$opt" in
        f)  ff=true
            ch=false;;
        c)  ff=false
            ch=true;;
        p)  pkg=true;;
        :)  echo "-${OPTARG} requires an argument" >&2
            usage
            exit 1;;
        \?) echo "Invalid option: -${OPTARG}" >&2
            usage
            exit 1;;
        *)  usage
            exit 1;;
    esac
done
shift $((OPTIND - 1))
if [ $# -gt 0 ]; then
    usage
    exit 1
fi

name="rededup"
version="$(jq -r '.version' <manifest.json)"
vname="${name}-${version}"

mkdir -p build/
if $pkg; then
    mkdir -p artifacts/
fi

build_dir="build/${vname}"
mkdir -p "${build_dir}"

# Firefox
if $ff; then
    ff_build_dir="${build_dir}/firefox"
    echo "Firefox: Creating ${ff_build_dir}"
    rm -rf "${ff_build_dir}"
    mkdir "${ff_build_dir}"
    rsync -R "${FF_FILES[@]}" "${ff_build_dir}"
    if $pkg; then
        echo "Firefox: Building artifacts/${vname}-fx.zip"
        (cd "${ff_build_dir}" && zip "${vname}-fx.zip" "${FF_FILES[@]}")
        mv -i "${ff_build_dir}/${vname}-fx.zip" "artifacts/${vname}-fx.zip"
    fi
fi

# Chrome
if $ch; then
    ch_build_dir="${build_dir}/chrome"
    echo "Chrome: Creating ${ch_build_dir}"
    rm -rf "${ch_build_dir}"
    mkdir "${ch_build_dir}"
    rsync -R "${CH_FILES[@]}" "${ch_build_dir}"
    ## Apply manifest changes for chrome
    jq -f chrome.jq <manifest.json >"${ch_build_dir}/manifest.json"
    ## Add browser-polyfill.js
    download "${PF_URL}" "${ch_build_dir}/browser-polyfill.js"
    ### Remove source map comment, see
    ### https://bugs.chromium.org/p/chromium/issues/detail?id=212374
    sed -i.bak '\://# sourceMappingURL=.*:d' \
        "${ch_build_dir}/browser-polyfill.js"
    CH_FILES+=(browser-polyfill.js)
    sed -e 's/\(\s*\)<!-- \(.*browser-polyfill.js.*\) -->/\1\2/g' \
        <options/index.html >"${ch_build_dir}/options/index.html"
    if $pkg; then
        echo "Chrome: Building artifacts/${vname}-ch.zip"
        (cd "${ch_build_dir}" && zip "${vname}-ch.zip" "${CH_FILES[@]}")
        mv -i "${ch_build_dir}/${vname}-ch.zip" "artifacts/${vname}-ch.zip"
    fi
fi

echo "Success"
