#! /bin/bash

set -eu
set -o pipefail

FILES=(
    LICENSE.txt
    manifest.json
    dct.js
    icon.svg
    rededup.js
    settings.html
    settings.js
)

name="rededup"
version="$(jq -r '.version' <manifest.json)"
vname="${name}-${version}"

mkdir -p build/ artifacts/

build_dir="build/${vname}"
rm -rf "${build_dir}"
mkdir "${build_dir}"

rsync -R "${FILES[@]}" "${build_dir}"
(cd "${build_dir}" && zip "${vname}.zip" "${FILES[@]}")
mv -i "${build_dir}/${vname}.zip" "artifacts/${vname}.zip"
