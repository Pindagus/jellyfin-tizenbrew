#!/usr/bin/env bash
# Fails when dist-build/ looks complete but would not actually run on the TV.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/dist-build"
INDEX="${OUT}/www/index.html"
FAILED=0

fail() {
    echo "VERIFY FAIL: $1" >&2
    FAILED=1
}

[ -f "${INDEX}" ] || { fail "missing ${INDEX}"; echo "verification failed" >&2; exit 1; }

# The whole project exists to replace this placeholder. If it survived, the
# module will not start inside TizenBrew.
if grep -q 'WEBAPIS' "${INDEX}"; then
    fail "index.html still references the \$WEBAPIS placeholder; the core patch did not apply"
fi

if ! grep -q 'tizen-adapter.js' "${INDEX}"; then
    fail "index.html does not load tizen-adapter.js"
fi

for required in "${OUT}/package.json" "${OUT}/tizen-adapter.js" "${OUT}/tizen.js" "${OUT}/index.html"; do
    [ -f "${required}" ] || fail "missing ${required}"
done

# A real jellyfin-web build is tens of megabytes; anything tiny means the copy failed.
if [ -d "${OUT}/www" ]; then
    FILE_COUNT="$(find "${OUT}/www" -type f | wc -l | tr -d ' ')"
    if [ "${FILE_COUNT}" -lt 50 ]; then
        fail "www/ has only ${FILE_COUNT} files, expected a full jellyfin-web build"
    fi
fi

if [ "${FAILED}" -ne 0 ]; then
    echo "verification failed" >&2
    exit 1
fi

echo "verification passed"
