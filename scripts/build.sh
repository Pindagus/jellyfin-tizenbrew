#!/usr/bin/env bash
# Builds the TizenBrew package into dist-build/.
# Usage: ./scripts/build.sh [jellyfin-web-tag]
set -euo pipefail

# Our own semver, normally supplied by CI: a release takes it from the git tag
# being built, a dev build from the next version that tag would become. The
# fallback only applies to a local build, which is never published.
MODULE_VERSION="${MODULE_VERSION_OVERRIDE:-0.0.0-local}"

# The oldest Jellyfin server jellyfin-web will talk to. The client refuses to
# connect below this (ConnectionState.ServerUpdateNeeded), so a change here
# strands every user still on an older server and is the signal that a second
# release line, pinned to the previous jellyfin-web, has become necessary.
EXPECTED_MIN_SERVER="10.10.0"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="${ROOT}/.build-work"
OUT="${ROOT}/dist-build"

# versions.json pins what to clone, so rebuilding an old tag reproduces the
# package that tag shipped. An argument overrides the jellyfin-web pin, which is
# only for trying a version out before proposing it.
PINNED_WEB="$(jq -r '.jellyfinWeb // empty' "${ROOT}/versions.json")"
PINNED_TIZEN="$(jq -r '.jellyfinTizen // empty' "${ROOT}/versions.json")"

if [ -z "${PINNED_WEB}" ] || [ -z "${PINNED_TIZEN}" ]; then
    echo "versions.json must set both jellyfinWeb and jellyfinTizen" >&2
    exit 1
fi

WEB_TAG="${1:-${PINNED_WEB}}"

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

echo "==> Cloning jellyfin-tizen @ ${PINNED_TIZEN}"
# jellyfin-tizen publishes no tags or releases, so a commit is the only way to
# pin it. `clone --depth 1` cannot take an arbitrary commit, hence fetching the
# one commit into an empty repository instead.
mkdir -p "${WORK}/jellyfin-tizen"
git -C "${WORK}/jellyfin-tizen" init -q
git -C "${WORK}/jellyfin-tizen" remote add origin https://github.com/jellyfin/jellyfin-tizen.git
if ! git -C "${WORK}/jellyfin-tizen" fetch -q --depth 1 origin "${PINNED_TIZEN}"; then
    echo "could not fetch jellyfin-tizen commit ${PINNED_TIZEN}; it may have been force-pushed away" >&2
    exit 1
fi
git -C "${WORK}/jellyfin-tizen" checkout -q FETCH_HEAD

TIZEN_COMMIT="$(git -C "${WORK}/jellyfin-tizen" rev-parse --short HEAD)"
echo "jellyfin-tizen at ${TIZEN_COMMIT}"

echo "==> Applying patches"
patch_file "${WORK}/jellyfin-tizen/gulpfile.babel.js" \
    "webapis.setAttribute('src', '\$WEBAPIS/webapis/webapis.js');" \
    "webapis.setAttribute('src', '../tizen-adapter.js');" \
    "webapis-to-adapter"

echo "==> Building jellyfin-web"
cd "${WORK}/jellyfin-web"
npm ci --no-audit
USE_SYSTEM_FONTS=1 npm run build:production

echo "==> Checking the minimum server version jellyfin-web accepts"
# Read straight from the SDK rather than trusting release notes: this constant
# is what the running client actually enforces.
SDK_VERSIONS="${WORK}/jellyfin-web/node_modules/@jellyfin/sdk/lib/versions.js"
if [ -f "${SDK_VERSIONS}" ]; then
    ACTUAL_MIN_SERVER="$(grep -oE "MINIMUM_VERSION = '[^']+'" "${SDK_VERSIONS}" | grep -oE "'[^']+'" | tr -d "'" || true)"

    if [ -z "${ACTUAL_MIN_SERVER}" ]; then
        echo "::warning::could not read MINIMUM_VERSION from ${SDK_VERSIONS}; upstream may have restructured it"
    elif [ "${ACTUAL_MIN_SERVER}" != "${EXPECTED_MIN_SERVER}" ]; then
        echo "::warning::jellyfin-web now requires server ${ACTUAL_MIN_SERVER}, was ${EXPECTED_MIN_SERVER}. Servers below ${ACTUAL_MIN_SERVER} can no longer connect with this build. Consider keeping a release line pinned to the previous jellyfin-web, then update EXPECTED_MIN_SERVER in this script."
    else
        echo "minimum server version unchanged: ${ACTUAL_MIN_SERVER}"
    fi
else
    echo "::warning::${SDK_VERSIONS} not found; skipped the minimum server version check"
fi

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

# The version is a placeholder here. semantic-release works out the real one
# from the commit history after this build has run, and scripts/set-version.sh
# writes it into both this manifest and the adapter. Publishing a build that
# never went through that step would ship 0.0.0-local, which verify-build.sh
# refuses.
#
# Attaching the jellyfin-web version as semver build metadata
# ("+jellyfin-web.10.11.11") was tried and does not work: npm strips it on
# publish and, worse, ignores it when comparing, so two builds against different
# jellyfin-web releases collide as one already-published version. Both upstream
# versions are recorded as fields instead, which npm does preserve.
cat > "${OUT}/package.json" <<EOF
{
  "name": "@pindagus/jellyfin-tizenbrew",
  "version": "${MODULE_VERSION}",
  "description": "Jellyfin for Samsung Smart TV via TizenBrew",
  "license": "MPL-2.0",
  "jellyfinWeb": "${WEB_VERSION}",
  "jellyfinTizen": "${TIZEN_COMMIT}",
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

# The jellyfin-web version is known now and never changes afterwards, so it is
# stamped here. The module version is not: set-version.sh handles that.
perl -pi -e "s/var WEB_VERSION = 'DEVELOPMENT';/var WEB_VERSION = '${WEB_VERSION}';/" \
    "${OUT}/tizen-adapter.js"

# A local build has no semantic-release step after it, so stamp the placeholder
# now to keep verify-build.sh meaningful.
if [ "${MODULE_VERSION}" = '0.0.0-local' ]; then
    "${ROOT}/scripts/set-version.sh" "${MODULE_VERSION}"
fi

echo "==> Verifying output"
"${ROOT}/scripts/verify-build.sh"

echo "==> Done. Output in ${OUT}"
