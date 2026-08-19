import { describe, it, expect, beforeEach, vi } from 'vitest';
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

// Minimal fake element supporting only what injectVersionInfo touches:
// classList-free className/style/textContent, appendChild, and closest().
function createFakeElement(tagName) {
    return {
        tagName,
        id: '',
        className: '',
        style: {},
        textContent: '',
        children: [],
        parentNode: null,
        appendChild(child) {
            child.parentNode = this;
            this.children.push(child);
            return child;
        },
        insertBefore(newNode, referenceNode) {
            newNode.parentNode = this;
            const index = this.children.indexOf(referenceNode);
            if (index === -1) {
                this.children.push(newNode);
            } else {
                this.children.splice(index, 0, newNode);
            }
            return newNode;
        },
        closest(selector) {
            if (selector === '.verticalSection' && this._section) {
                return this._section;
            }
            return null;
        }
    };
}

// Minimal fake document, just enough for injectVersionInfo: getElementById,
// createElement, and a querySelectorAll that can return zero or one heading.
function createFakeDocument({ withAnchor } = {}) {
    const body = createFakeElement('body');
    let heading = null;

    if (withAnchor) {
        const section = createFakeElement('div');
        section.className = 'verticalSection verticalSection-extrabottompadding';
        heading = createFakeElement('h2');
        heading.className = 'sectionTitle headerUsername';
        heading._section = section;
        section.appendChild(heading);
        body.appendChild(section);
    }

    const injected = [];

    return {
        _injected: injected,
        getElementById(id) {
            return injected.find((el) => el.id === id) || null;
        },
        querySelectorAll(selector) {
            if (selector === 'h2.sectionTitle.headerUsername' && heading) {
                return [heading];
            }
            return [];
        },
        createElement(tag) {
            const el = createFakeElement(tag);
            if (tag === 'div') {
                // Track only elements that get an id assigned (our own container),
                // so getElementById can find it on a repeat call.
                Object.defineProperty(el, 'id', {
                    get() { return el._id || ''; },
                    set(value) {
                        el._id = value;
                        if (value) {
                            injected.push(el);
                        }
                    }
                });
            }
            return el;
        }
    };
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

    it('navigates back to the TizenBrew launcher on exit', () => {
        win.location = { href: '' };

        const app = win.tizen.application.getCurrentApplication();
        app.exit();

        expect(win.location.href).toBe('/tizenbrew-ui/dist/index.html');
    });

    it('prefers an explicit TizenBrew exit hook over the location fallback', () => {
        win.location = { href: '' };
        let called = false;
        win.tizenbrew = { exit: () => { called = true; } };

        const app = win.tizen.application.getCurrentApplication();
        app.exit();

        expect(called).toBe(true);
        // The fallback navigation must not also run when the hook succeeds.
        expect(win.location.href).toBe('');
    });

    it('warns instead of throwing when exit has no usable mechanism', () => {
        win.location = undefined;
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const app = win.tizen.application.getCurrentApplication();
        expect(() => app.exit()).not.toThrow();
        expect(warnSpy).toHaveBeenCalled();

        warnSpy.mockRestore();
    });

    describe('settings version info injection', () => {
        it('does not crash and injects nothing when the anchor is missing', () => {
            const doc = createFakeDocument({ withAnchor: false });

            expect(() => win.__tizenAdapterInjectVersionInfo(doc)).not.toThrow();
            expect(doc.getElementById('tizenAdapterVersionInfo')).toBeNull();
        });

        it('injects a block containing both version numbers when the anchor exists', () => {
            const doc = createFakeDocument({ withAnchor: true });

            win.__tizenAdapterInjectVersionInfo(doc);

            const block = doc.getElementById('tizenAdapterVersionInfo');
            expect(block).not.toBeNull();

            const text = block.children.map((row) => row.textContent).join(' | ');
            // win here was loaded via loadAdapter(), which stamps the
            // DEVELOPMENT placeholders since no build step ran.
            expect(text).toContain('DEVELOPMENT');
            expect(text.match(/DEVELOPMENT/g).length).toBe(2);
        });

        it('does not inject the block twice on repeat calls', () => {
            const doc = createFakeDocument({ withAnchor: true });

            win.__tizenAdapterInjectVersionInfo(doc);
            win.__tizenAdapterInjectVersionInfo(doc);

            let count = 0;
            for (const el of doc._injected) {
                if (el.id === 'tizenAdapterVersionInfo') {
                    count++;
                }
            }
            expect(count).toBe(1);
        });
    });
});
