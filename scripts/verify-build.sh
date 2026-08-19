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

# package.json must be valid JSON and carry the TizenBrew fields TizenBrew
# reads to recognize and launch the module. Presence alone is not enough:
# an empty or malformed manifest passes a plain "file exists" check.
if [ -f "${OUT}/package.json" ]; then
    PKG_JSON_ERROR="$(node -e '
        const fs = require("fs");
        const path = process.argv[1];
        let pkg;
        try {
            pkg = JSON.parse(fs.readFileSync(path, "utf8"));
        } catch (e) {
            console.log("package.json is not valid JSON: " + e.message);
            process.exit(0);
        }
        if (pkg.packageType !== "app") {
            console.log("package.json packageType is " + JSON.stringify(pkg.packageType) + ", expected \"app\"");
        } else if (pkg.appName !== "Jellyfin") {
            console.log("package.json appName is " + JSON.stringify(pkg.appName) + ", expected \"Jellyfin\"");
        } else if (pkg.appPath !== "index.html") {
            console.log("package.json appPath is " + JSON.stringify(pkg.appPath) + ", expected \"index.html\"");
        } else if (!Array.isArray(pkg.keys) || pkg.keys.length < 8) {
            console.log("package.json keys is missing or has fewer than 8 entries");
        }
    ' "${OUT}/package.json")"
    [ -z "${PKG_JSON_ERROR}" ] || fail "${PKG_JSON_ERROR}"
fi

# tizen.js is the TizenBrew wrapper. An empty or truncated file means the
# copy step silently failed even though the file exists.
if [ -f "${OUT}/tizen.js" ]; then
    TIZEN_JS_SIZE="$(wc -c < "${OUT}/tizen.js" | tr -d ' ')"
    if [ "${TIZEN_JS_SIZE}" -lt 1000 ]; then
        fail "tizen.js is only ${TIZEN_JS_SIZE} bytes, expected the full TizenBrew wrapper"
    elif ! grep -q 'AppInfo' "${OUT}/tizen.js"; then
        fail "tizen.js does not look like the TizenBrew wrapper (missing AppInfo)"
    fi
fi

# tizen-adapter.js must have had its version stamp applied by build.sh, and
# must expose window.tizen for the app to detect the TV environment.
if [ -f "${OUT}/tizen-adapter.js" ]; then
    if [ ! -s "${OUT}/tizen-adapter.js" ]; then
        fail "tizen-adapter.js is empty"
    else
        if grep -q "'DEVELOPMENT'" "${OUT}/tizen-adapter.js"; then
            fail "tizen-adapter.js still contains the 'DEVELOPMENT' placeholder; the version stamping step did not run"
        fi
        if ! grep -q 'window.tizen' "${OUT}/tizen-adapter.js"; then
            fail "tizen-adapter.js does not define window.tizen"
        fi
    fi
fi

# The top-level index.html is a redirect stub that must point into www/.
if [ -f "${OUT}/index.html" ]; then
    if ! grep -q 'www/index.html' "${OUT}/index.html"; then
        fail "top-level index.html does not redirect to www/index.html"
    fi
fi

# A real jellyfin-web build has 1242 files; anything far below that means the
# copy was incomplete.
if [ -d "${OUT}/www" ]; then
    FILE_COUNT="$(find "${OUT}/www" -type f | wc -l | tr -d ' ')"
    if [ "${FILE_COUNT}" -lt 500 ]; then
        fail "www/ has only ${FILE_COUNT} files, expected a full jellyfin-web build (~1242 files)"
    fi
fi

if [ "${FAILED}" -ne 0 ]; then
    echo "verification failed" >&2
    exit 1
fi

echo "verification passed"
