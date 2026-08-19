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
});
