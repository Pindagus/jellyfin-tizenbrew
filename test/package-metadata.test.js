import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const METADATA_PATH = new URL('../dist-build/package.json', import.meta.url);

// Local development has no build yet, so these tests skip when dist-build/ is
// missing. But a CI gate that only checks the exit code would then see a false
// green: skipped tests report as passed, so the metadata would never actually
// be verified. REQUIRE_DIST_BUILD closes that gap: when set, CI opts out of the
// skip and the tests fail loudly (with a message pointing at `npm run build`)
// instead of silently skipping.
const requireBuild = !!process.env.REQUIRE_DIST_BUILD;

function readMetadata() {
    if (requireBuild && !existsSync(METADATA_PATH)) {
        throw new Error(
            `${METADATA_PATH.pathname} not found. Run "npm run build" before ` +
            'running tests with REQUIRE_DIST_BUILD set.'
        );
    }

    return JSON.parse(readFileSync(METADATA_PATH, 'utf8'));
}

// These field names are what TizenBrew reads at the top level of package.json.
// Getting one wrong means the module silently fails to launch.
describe('TizenBrew package metadata', () => {
    it.skipIf(!requireBuild && !existsSync(METADATA_PATH))('declares the fields TizenBrew requires', () => {
        const pkg = readMetadata();

        expect(pkg.packageType).toBe('app');
        expect(pkg.appName).toBe('Jellyfin');
        expect(pkg.appPath).toBe('index.html');
        expect(pkg.name).toBe('@pindagus/jellyfin-tizenbrew');
    });

    it.skipIf(!requireBuild && !existsSync(METADATA_PATH))('registers the media keys the wrapper uses', () => {
        const pkg = readMetadata();

        // jellyfin-tizen/tizen.js calls registerKey for exactly these.
        const required = [
            'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop',
            'MediaTrackPrevious', 'MediaTrackNext', 'MediaRewind', 'MediaFastForward'
        ];

        for (const key of required) {
            expect(pkg.keys).toContain(key);
        }
    });
});
