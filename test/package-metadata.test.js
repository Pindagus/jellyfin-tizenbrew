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

    it.skipIf(!requireBuild && !existsSync(METADATA_PATH))('records what upstream code the release contains', () => {
        const pkg = readMetadata();

        // Nothing from Jellyfin is vendored, so these two fields are the only
        // record of what a release was built from. CI also reads them back off
        // the registry to size the next version bump and to decide whether
        // upstream moved at all. Losing one fails no build; it silently
        // degrades every future release to a patch and makes the update check
        // rebuild forever, so both are asserted here.
        expect(pkg.jellyfinWeb).toMatch(/^\d+\.\d+\.\d+/);
        expect(pkg.jellyfinTizen).toMatch(/^[0-9a-f]{7,40}$/);
    });

    it.skipIf(!requireBuild && !existsSync(METADATA_PATH))('points at the repository provenance is signed against', () => {
        const pkg = readMetadata();

        // Releases publish over trusted publishing, which attaches a provenance
        // statement and makes npm compare this field against the repository the
        // workflow ran in. A mismatch is not a warning: the upload is rejected
        // with E422 after the build has already succeeded, which is how the
        // first release attempt failed.
        expect(pkg.repository?.url).toBe('git+https://github.com/Pindagus/jellyfin-tizenbrew.git');
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
