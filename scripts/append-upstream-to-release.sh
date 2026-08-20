#!/usr/bin/env bash
# Adds the upstream versions to a published GitHub release.
# Usage: ./scripts/append-upstream-to-release.sh v1.2.3
#
# Release notes are generated from commit subjects, which name jellyfin-web only
# when that release happened to bump it. Anyone deciding whether a release suits
# their server needs the version either way, so it is appended here, after
# semantic-release has created the release.
set -euo pipefail

TAG="${1:-}"
if [ -z "${TAG}" ]; then
    echo "usage: $0 <tag>" >&2
    exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST="${ROOT}/dist-build/package.json"

if [ ! -f "${MANIFEST}" ]; then
    echo "::warning::${MANIFEST} not found; release ${TAG} keeps its notes unchanged"
    exit 0
fi

WEB="$(jq -r '.jellyfinWeb // empty' "${MANIFEST}")"
TIZEN="$(jq -r '.jellyfinTizen // empty' "${MANIFEST}")"

if [ -z "${WEB}" ] || [ -z "${TIZEN}" ]; then
    echo "::warning::manifest has no upstream versions; release ${TAG} keeps its notes unchanged"
    exit 0
fi

# A missing release is not worth failing a publish that already succeeded: the
# package is on npm by this point, and the notes are cosmetic next to that.
if ! BODY="$(gh release view "${TAG}" --json body --jq .body 2>/dev/null)"; then
    echo "::warning::could not read release ${TAG}; its notes keep the generated text"
    exit 0
fi

FOOTER="**Built against** jellyfin-web \`${WEB}\`, jellyfin-tizen \`${TIZEN}\`"

if printf '%s' "${BODY}" | grep -qF '**Built against**'; then
    echo "release ${TAG} already names its upstream versions"
    exit 0
fi

if ! printf '%s\n\n---\n\n%s\n' "${BODY}" "${FOOTER}" | gh release edit "${TAG}" --notes-file -; then
    echo "::warning::could not update the notes on release ${TAG}"
    exit 0
fi

echo "added upstream versions to release ${TAG}"
