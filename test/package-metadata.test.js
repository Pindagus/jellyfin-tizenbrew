import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const METADATA_PATH = new URL('../dist-build/package.json', import.meta.url);

// These field names are what TizenBrew reads at the top level of package.json.
// Getting one wrong means the module silently fails to launch.
describe('TizenBrew package metadata', () => {
    it.skipIf(!existsSync(METADATA_PATH))('declares the fields TizenBrew requires', () => {
        const pkg = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));

        expect(pkg.packageType).toBe('app');
        expect(pkg.appName).toBe('Jellyfin');
        expect(pkg.appPath).toBe('index.html');
        expect(pkg.name).toBe('@pindagus/jellyfin-tizenbrew');
    });

    it.skipIf(!existsSync(METADATA_PATH))('registers the media keys the wrapper uses', () => {
        const pkg = JSON.parse(readFileSync(METADATA_PATH, 'utf8'));

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
