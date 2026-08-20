#!/usr/bin/env bash
# Writes a version into the built package, in dist-build/.
# Usage: ./scripts/set-version.sh 1.2.3
#
# The build runs before the version is known: semantic-release derives it from
# the commit history afterwards and calls this from its prepare step. Keeping it
# separate is what lets the number reach both the npm manifest and the version
# block shown on the TV, which reads it out of the adapter.
set -euo pipefail

VERSION="${1:-}"
if [ -z "${VERSION}" ]; then
    echo "usage: $0 <version>" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/dist-build"

if [ ! -f "${OUT}/package.json" ] || [ ! -f "${OUT}/tizen-adapter.js" ]; then
    echo "dist-build/ is missing or incomplete; run scripts/build.sh first" >&2
    exit 1
fi

# jq rather than a text substitution: the manifest is JSON, and a regex over it
# would silently corrupt the file if the formatting ever changed.
jq --arg v "${VERSION}" '.version = $v' "${OUT}/package.json" > "${OUT}/package.json.tmp"
mv "${OUT}/package.json.tmp" "${OUT}/package.json"

# The adapter carries either the untouched placeholder (first run) or a version
# a previous run wrote (semantic-release calls prepare once per release, but a
# retry would run it twice). Both have to be replaceable, hence matching the
# assignment rather than the literal 'DEVELOPMENT'.
perl -pi -e "s/var MODULE_VERSION = '[^']*';/var MODULE_VERSION = '${VERSION}';/" \
    "${OUT}/tizen-adapter.js"

STAMPED="$(grep -oE "var MODULE_VERSION = '[^']*'" "${OUT}/tizen-adapter.js" | head -1)"
if [ "${STAMPED}" != "var MODULE_VERSION = '${VERSION}'" ]; then
    echo "failed to stamp the adapter: found ${STAMPED:-nothing}" >&2
    exit 1
fi

WEB="$(jq -r '.jellyfinWeb' "${OUT}/package.json")"
echo "set version ${VERSION} in dist-build/ (jellyfin-web ${WEB})"
