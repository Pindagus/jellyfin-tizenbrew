#!/usr/bin/env bash
# Builds the TizenBrew package into dist-build/.
# Usage: ./scripts/build.sh [jellyfin-web-tag]
set -euo pipefail

# Our own semver for the module itself, independent of the jellyfin-web version
# it bundles. Bump this by hand whenever we ship a change to tizen-adapter.js
# or the packaging around it (not for routine jellyfin-web version bumps).
MODULE_VERSION="1.0.0"

WEB_TAG="${1:-master}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.build-work"
OUT="${ROOT}/dist-build"

# Applies a literal string replacement, warning instead of failing when the
# pattern is gone. Upstream renames should surface as a warning, never as a
# broken build.
#
# Pattern and replacement are passed to perl via environment variables rather
# than interpolated into the perl -e string. Interpolating them directly (as
# `s\a\Q${pattern}\E\a${replacement}\a`) is fragile here: the pattern contains
# a literal `$` (from `$WEBAPIS`) and single quotes, which can break out of
# the \Q...\E escaping or the shell quoting depending on what upstream's
# gulpfile line looks like. Passing them through %ENV keeps the values inert
# data as far as both bash and the perl parser are concerned, so \Q...\E can
# safely quote-meta them for a literal, non-regex match.
patch_file() {
    local file="$1" pattern="$2" replacement="$3" label="$4"

    if [ ! -f "${file}" ]; then
        echo "::warning::patch '${label}' skipped, file not found: ${file}"
        return 0
    fi

    if ! grep -qF "${pattern}" "${file}"; then
        echo "::warning::patch '${label}' skipped, pattern not found in ${file}"
        return 0
    fi

    PATCH_PATTERN="${pattern}" PATCH_REPLACEMENT="${replacement}" perl -0pi -e '
        BEGIN { $p = $ENV{PATCH_PATTERN}; $r = $ENV{PATCH_REPLACEMENT}; }
        s/\Q$p\E/$r/g;
    ' "${file}"
    echo "patch '${label}' applied to ${file}"
}

rm -rf "${WORK}" "${OUT}"
mkdir -p "${WORK}"

echo "==> Cloning jellyfin-web @ ${WEB_TAG}"
git clone --depth 1 --branch "${WEB_TAG}" \
    https://github.com/jellyfin/jellyfin-web.git "${WORK}/jellyfin-web"

echo "==> Cloning jellyfin-tizen @ master"
git clone --depth 1 --branch master \
    https://github.com/jellyfin/jellyfin-tizen.git "${WORK}/jellyfin-tizen"

echo "==> Applying patches"
patch_file "${WORK}/jellyfin-tizen/gulpfile.babel.js" \
    "webapis.setAttribute('src', '\$WEBAPIS/webapis/webapis.js');" \
    "webapis.setAttribute('src', '../tizen-adapter.js');" \
    "webapis-to-adapter"

echo "==> Building jellyfin-web"
cd "${WORK}/jellyfin-web"
npm ci --no-audit
USE_SYSTEM_FONTS=1 npm run build:production

echo "==> Building the tizen wrapper"
cp "${ROOT}/tizen-adapter.js" "${WORK}/jellyfin-tizen/tizen-adapter.js"
cd "${WORK}/jellyfin-tizen"
rm -f .gitignore
JELLYFIN_WEB_DIR="${WORK}/jellyfin-web/dist" npm ci --no-audit

echo "==> Assembling dist-build/"
mkdir -p "${OUT}"
cp -R "${WORK}/jellyfin-tizen/www" "${OUT}/www"
cp "${WORK}/jellyfin-tizen/index.html" "${OUT}/index.html"
cp "${WORK}/jellyfin-tizen/tizen.js" "${OUT}/tizen.js"
cp "${ROOT}/tizen-adapter.js" "${OUT}/tizen-adapter.js"

echo "==> Writing TizenBrew metadata"
# PACKAGE_VERSION carries the jellyfin-web version being bundled (set by CI from
# the resolved jellyfin-web tag; defaults to a dev placeholder for local builds).
WEB_VERSION="${PACKAGE_VERSION:-0.0.0-dev}"

# npm's published version stays our own MODULE_VERSION, with the bundled
# jellyfin-web version attached as semver build metadata (the "+..." suffix).
# npm accepts this natively; it is not part of version comparisons.
PACKAGE_VERSION_FULL="${MODULE_VERSION}+jellyfin-web.${WEB_VERSION}"

cat > "${OUT}/package.json" <<EOF
{
  "name": "@pindagus/jellyfin-tizenbrew",
  "version": "${PACKAGE_VERSION_FULL}",
  "description": "Jellyfin for Samsung Smart TV via TizenBrew",
  "license": "MPL-2.0",
  "packageType": "app",
  "appName": "Jellyfin",
  "appPath": "index.html",
  "keys": [
    "MediaPlayPause",
    "MediaPlay",
    "MediaPause",
    "MediaStop",
    "MediaTrackPrevious",
    "MediaTrackNext",
    "MediaRewind",
    "MediaFastForward"
  ]
}
EOF

# Stamp the adapter with both version numbers, replacing the DEVELOPMENT defaults.
perl -pi -e "s/var MODULE_VERSION = 'DEVELOPMENT';/var MODULE_VERSION = '${MODULE_VERSION}';/" \
    "${OUT}/tizen-adapter.js"
perl -pi -e "s/var WEB_VERSION = 'DEVELOPMENT';/var WEB_VERSION = '${WEB_VERSION}';/" \
    "${OUT}/tizen-adapter.js"

echo "==> Verifying output"
"${ROOT}/scripts/verify-build.sh"

echo "==> Done. Output in ${OUT}"
