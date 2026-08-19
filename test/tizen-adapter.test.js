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
});
