import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const adapterSource = readFileSync(new URL('../tizen-adapter.js', import.meta.url), 'utf8');

// The adapter is an IIFE that assigns to window. Evaluate it against a fake window
// so each test starts from a clean slate.
//
// `history` is accepted because the adapter reads history.length at load time to
// work out how far back the launcher sits; tests that exercise exit have to be
// able to set that starting depth.
function loadAdapter({ history } = {}) {
    const win = { screen: { width: 1920, height: 1080 } };
    if (history) {
        win.history = history;
    }
    const fn = new Function('window', adapterSource);
    fn(win);
    return win;
}

// Simulates TizenBrew's history: the launcher navigated here with location.href,
// so the module starts one entry deep. Navigating pushes entries the way a
// single-page app does, and back()/go() move through them, so a test can assert
// where the user ends up rather than which method was called.
function createFakeHistory({ entriesBeforeModule = 1 } = {}) {
    const entries = [];
    for (let i = 0; i < entriesBeforeModule; i++) {
        entries.push(i === entriesBeforeModule - 1 ? 'launcher' : `outside-${i}`);
    }
    entries.push('module:/home');

    let index = entries.length - 1;

    return {
        get length() {
            return entries.length;
        },
        push(entry) {
            index += 1;
            entries.length = index;
            entries.push(entry);
        },
        go(delta) {
            index = Math.max(0, Math.min(entries.length - 1, index + delta));
        },
        back() {
            this.go(-1);
        },
        currentEntry() {
            return entries[index];
        }
    };
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

    describe('exit', () => {
        // These assert where the user ends up, not which history method ran. An
        // earlier version checked only that back() was called, which stayed green
        // while exiting from the settings page landed on a jellyfin page on a real
        // TV instead of returning to TizenBrew.

        it('returns to the launcher when exiting without having navigated', () => {
            const history = createFakeHistory();
            const local = loadAdapter({ history });
            local.location = { href: 'http://127.0.0.1:8081/module/x/www/index.html' };

            local.tizen.application.getCurrentApplication().exit();

            expect(history.currentEntry()).toBe('launcher');
            // Navigating by URL would hit the proxy, which serves a bare IP
            // address outside /module/ and renders as a black screen.
            expect(local.location.href).toBe('http://127.0.0.1:8081/module/x/www/index.html');
        });

        it('returns to the launcher after jellyfin-web has pushed history entries', () => {
            // The reported failure: visit settings, go back to home via the UI,
            // then exit. jellyfin-web pushes an entry per view, so a single
            // back() would land on the previous jellyfin page.
            const history = createFakeHistory();
            const local = loadAdapter({ history });

            history.push('module:/usersettings');
            history.push('module:/home');

            local.tizen.application.getCurrentApplication().exit();

            expect(history.currentEntry()).toBe('launcher');
        });

        it('returns to the launcher from deep inside the app', () => {
            const history = createFakeHistory();
            const local = loadAdapter({ history });

            for (let i = 0; i < 12; i++) {
                history.push(`module:/details/${i}`);
            }

            local.tizen.application.getCurrentApplication().exit();

            expect(history.currentEntry()).toBe('launcher');
        });

        it('warns instead of throwing when exit has no usable mechanism', () => {
            const local = loadAdapter();
            local.history = undefined;
            const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

            const app = local.tizen.application.getCurrentApplication();
            expect(() => app.exit()).not.toThrow();
            expect(warnSpy).toHaveBeenCalled();

            warnSpy.mockRestore();
        });
    });

    describe('settings version info injection', () => {
        it('does not crash and injects nothing when the anchor is missing', () => {
            const doc = createFakeDocument({ withAnchor: false });

            expect(() => win.__tizenAdapterInjectVersionInfo(doc)).not.toThrow();
            expect(doc.getElementById('tizenAdapterVersionInfo')).toBeNull();
        });

        it('injects a block naming every version the build stamps', () => {
            const doc = createFakeDocument({ withAnchor: true });

            win.__tizenAdapterInjectVersionInfo(doc);

            const block = doc.getElementById('tizenAdapterVersionInfo');
            expect(block).not.toBeNull();

            const text = block.children.map((row) => row.textContent).join(' | ');

            // This block is the only place a user can see what their TV is
            // running, so every stamped version has to reach it. jellyfin-tizen
            // was stamped into package.json but not into the adapter, which is
            // how it went missing from the settings page on a real TV.
            expect(text).toContain('jellyfin-web');
            expect(text).toContain('jellyfin-tizen');
            expect(text).toContain('Module');

            // win here was loaded via loadAdapter(), which leaves the
            // DEVELOPMENT placeholders since no build step ran: one per
            // stamped version.
            expect(text.match(/DEVELOPMENT/g).length).toBe(3);
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

    // The build puts this script in <head> without `defer`, so it executes while
    // document.body is still null. These tests pin that startup path: observing a
    // null node throws, which used to leave the block silently uninjected.
    describe('observer startup before body exists', () => {
        // Loads the adapter against a real global document, the way the browser
        // does, rather than calling the exported inject helper directly.
        function loadAdapterInDocument({ bodyAtLoad }) {
            const doc = createFakeDocument({ withAnchor: true });
            const listeners = {};

            doc.body = bodyAtLoad ? createFakeElement('body') : null;
            doc.addEventListener = (event, handler) => {
                listeners[event] = handler;
            };

            const observed = [];
            class FakeMutationObserver {
                constructor(callback) {
                    this.callback = callback;
                }
                observe(target) {
                    if (!target) {
                        throw new TypeError("parameter 1 is not of type 'Node'");
                    }
                    observed.push(target);
                }
            }

            const win = { screen: { width: 1920, height: 1080 } };
            const fn = new Function('window', 'document', 'MutationObserver', 'console', adapterSource);
            fn(win, doc, FakeMutationObserver, { warn: () => {} });

            return { win, doc, listeners, observed };
        }

        it('defers observing until DOMContentLoaded when body is not parsed yet', () => {
            const { doc, listeners, observed } = loadAdapterInDocument({ bodyAtLoad: false });

            // Nothing may be observed yet: body did not exist at load time.
            expect(observed).toHaveLength(0);
            expect(listeners.DOMContentLoaded).toBeTypeOf('function');

            doc.body = createFakeElement('body');
            listeners.DOMContentLoaded();

            expect(observed).toHaveLength(1);
            expect(doc.getElementById('tizenAdapterVersionInfo')).not.toBeNull();
        });

        it('observes immediately when body already exists', () => {
            const { doc, observed } = loadAdapterInDocument({ bodyAtLoad: true });

            expect(observed).toHaveLength(1);
            expect(doc.getElementById('tizenAdapterVersionInfo')).not.toBeNull();
        });
    });
});
