import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const adapterSource = readFileSync(new URL('../tizen-adapter.js', import.meta.url), 'utf8');

// The adapter is an IIFE that assigns to window. Evaluate it against a fake window
// so each test starts from a clean slate.
function loadAdapter() {
    const win = { screen: { width: 1920, height: 1080 } };
    const fn = new Function('window', adapterSource);
    fn(win);
    return win;
}

describe('tizen-adapter', () => {
    let win;

    beforeEach(() => {
        win = loadAdapter();
    });

    it('exposes the tizen and webapis globals the wrapper expects', () => {
        expect(win.tizen).toBeDefined();
        expect(win.webapis).toBeDefined();
    });

    it('invokes the DISPLAY callback instead of returning the value', () => {
        let received = null;
        win.tizen.systeminfo.getPropertyValue('DISPLAY', (result) => {
            received = result;
        });

        // The wrapper wraps this call in a Promise that only settles from the
        // callback. Returning the value instead would hang the app on the splash.
        expect(received).not.toBeNull();
        expect(received.resolutionWidth).toBe(1920);
        expect(received.resolutionHeight).toBe(1080);
    });

    it('still invokes the callback for unknown properties', () => {
        let called = false;
        win.tizen.systeminfo.getPropertyValue('SOMETHING_ELSE', () => {
            called = true;
        });

        expect(called).toBe(true);
    });

    it('does not throw when no callback is supplied', () => {
        expect(() => win.tizen.systeminfo.getPropertyValue('DISPLAY')).not.toThrow();
    });

    it('provides an app version string for AppInfo', () => {
        const app = win.tizen.application.getCurrentApplication();
        expect(typeof app.appInfo.version).toBe('string');
        expect(app.appInfo.version.length).toBeGreaterThan(0);
    });

    it('exposes exit as a callable so AppHost.exit does not throw', () => {
        const app = win.tizen.application.getCurrentApplication();
        expect(() => app.exit()).not.toThrow();
    });

    it('accepts key registration without throwing', () => {
        // TizenBrew registers the keys itself from package.json, so these are no-ops,
        // but the wrapper calls them unconditionally at startup.
        expect(() => win.tizen.tvinputdevice.registerKey('MediaPlay')).not.toThrow();
        expect(() => win.tizen.tvinputdevice.unregisterKey('MediaPlayPause')).not.toThrow();
    });

    it('reports UHD but not 8K panel support', () => {
        // The wrapper guards both with typeof === 'function', so they must be real
        // functions. devicePixelRatio is unreliable on the TV browser, hence hardcoding.
        expect(typeof win.webapis.productinfo.is8KPanelSupported).toBe('function');
        expect(win.webapis.productinfo.is8KPanelSupported()).toBe(false);
        expect(win.webapis.productinfo.isUdPanelSupported()).toBe(true);
    });
});
