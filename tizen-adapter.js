'use strict';

// Replaces Tizen's webapis.js inside TizenBrew, where the $WEBAPIS placeholder
// used by a packaged .wgt does not resolve.
(function () {
    // Replaced by the build workflow. MODULE_VERSION is our own semver for this
    // package, WEB_VERSION is the jellyfin-web version being bundled, and
    // TIZEN_COMMIT is the jellyfin-tizen commit it was built from (that
    // repository publishes no versions, so a commit is all there is to name).
    var MODULE_VERSION = 'DEVELOPMENT';
    var WEB_VERSION = 'DEVELOPMENT';
    var TIZEN_COMMIT = 'DEVELOPMENT';

    // Where this module started in the history, captured before jellyfin-web has
    // navigated anywhere. Exiting means returning to exactly this point, so both
    // readings have to be taken now rather than on exit.
    //
    // routerIndex is the reliable one. jellyfin-web routes with react-router
    // 6.30.1 (createHashRouter), which keeps its own position in
    // history.state.idx: it writes idx 0 on init and increments on every push,
    // leaving it alone on a replace. That counts only this app's own navigation.
    // history.length counts the whole tab, including whatever the launcher did
    // before handing over, so it is the fallback rather than the measure.
    function readRouterIndex() {
        if (!window.history) {
            return null;
        }

        var state = window.history.state;
        if (state && typeof state.idx === 'number') {
            return state.idx;
        }

        return null;
    }

    var ROUTER_INDEX_AT_LOAD = readRouterIndex();
    var HISTORY_DEPTH_AT_LOAD = (window.history && typeof window.history.length === 'number')
        ? window.history.length
        : 0;

    var EXIT_LOG_KEY = 'tizenAdapterLastExit';

    // Records what exit just tried, so the settings page can report it afterwards.
    // Written to storage rather than kept in memory because the interesting case
    // is the one where exit worked: the page is gone by then, and on a TV there
    // is no console to read. jellyfin-web itself reads localStorage on startup,
    // so it is known to work on this hardware.
    function recordExitAttempt(description) {
        try {
            if (window.localStorage && typeof window.localStorage.setItem === 'function') {
                window.localStorage.setItem(EXIT_LOG_KEY, description);
            }
        } catch (err) {
            // Storage can be disabled or full. Losing a diagnostic note must
            // never stop the user from leaving the app.
        }
    }

    function readLastExitAttempt() {
        try {
            if (window.localStorage && typeof window.localStorage.getItem === 'function') {
                return window.localStorage.getItem(EXIT_LOG_KEY);
            }
        } catch (err) {
            return null;
        }

        return null;
    }

    // Walks back one entry at a time, used when a single go(-n) turns out to do
    // nothing. Each step waits for the previous one, because navigation does not
    // complete synchronously and firing them in a loop would collapse into one.
    function stepBack(remaining) {
        if (remaining <= 0 || !window.history || typeof window.history.back !== 'function') {
            return;
        }

        window.history.back();

        if (remaining > 1 && typeof window.setTimeout === 'function') {
            window.setTimeout(function () {
                stepBack(remaining - 1);
            }, 120);
        }
    }

    var currentApplication = {
        appInfo: {
            // jellyfin-tizen reads this as the "app version" for its API headers.
            // The web version is more meaningful there than our own module version.
            version: WEB_VERSION
        },
        exit: function () {
            // TizenBrew hosts this module with a full page navigation (no iframe):
            // its launcher does `location.href = module.appPath` (tizenbrew-ui/
            // src/components/Modules.jsx:33), which destroys the launcher's own JS
            // context along with its Return-key handler. TizenBrew exposes no API
            // for returning to it: there is no window.tizenbrew object, no
            // postMessage listener, and the service's WebSocket accepts no
            // close-module event.
            //
            // The launcher is widget-local content, not something served over
            // HTTP: config.xml declares `<content src="tizenbrew-ui/dist/
            // index.html"/>`. Navigating there by URL therefore does NOT reach it.
            // The module runs on 127.0.0.1:8081, whose proxy answers anything
            // outside /module/ with a bare IP address as plain text, which is what
            // produced a black screen on the TV.
            //
            // Going back is the only route, but a single history.back() is wrong:
            // that assumes the launcher is still the previous entry, which only
            // holds until jellyfin-web navigates. It is a single-page app that
            // pushes an entry per view, so after visiting settings a plain back()
            // lands on a jellyfin page instead of the launcher. Jumping over
            // everything the app added clears it in one go.
            try {
                // Tried first because a TizenBrew build that provides it knows
                // how to return to its own launcher, which nothing here can do
                // as reliably. It is absent from TizenBrew's current source, but
                // exiting worked on a TV running the version of this adapter
                // that called it, and stopped working when it was removed, so
                // the hook is real on at least some builds.
                if (window.tizenbrew && typeof window.tizenbrew.exit === 'function') {
                    console.log('tizen-adapter: exit via the TizenBrew hook');
                    recordExitAttempt('TizenBrew hook');
                    window.tizenbrew.exit();
                    return;
                }

                if (!window.history) {
                    recordExitAttempt('failed: no history object');
                    console.warn('tizen-adapter: no way to exit, window.history is unavailable');
                    return;
                }

                var routerIndexNow = readRouterIndex();
                var added = 0;
                var source = 'none';

                if (ROUTER_INDEX_AT_LOAD !== null && routerIndexNow !== null) {
                    added = routerIndexNow - ROUTER_INDEX_AT_LOAD;
                    source = 'router';
                } else if (typeof window.history.length === 'number' && HISTORY_DEPTH_AT_LOAD > 0) {
                    added = window.history.length - HISTORY_DEPTH_AT_LOAD;
                    source = 'length';
                }

                // Logged because this cannot be reproduced off the TV: the same
                // code returns to the launcher in a desktop browser, so if it
                // fails again these three numbers are what identifies why.
                console.log('tizen-adapter: exit via ' + source
                    + ' (router ' + ROUTER_INDEX_AT_LOAD + '->' + routerIndexNow
                    + ', length ' + HISTORY_DEPTH_AT_LOAD + '->' + window.history.length
                    + ', jumping ' + -(added + 1) + ')');

                // A negative or zero count means the reading is not trustworthy
                // (a browser that caps history.length, or an exit before any
                // navigation), so fall back to a single step rather than
                // computing a jump that lands nowhere and leaves the user stuck.
                var reading = source + ' ' + (source === 'router'
                    ? ROUTER_INDEX_AT_LOAD + '→' + routerIndexNow
                    : HISTORY_DEPTH_AT_LOAD + '→' + window.history.length);

                if (added > 0 && typeof window.history.go === 'function') {
                    recordExitAttempt(reading + ', go(' + -(added + 1) + ')');
                    window.history.go(-(added + 1));

                    // go(-n) is not guaranteed to do anything on the TV's
                    // browser engine, and a call that silently does nothing
                    // leaves the user with no way out of the app at all.
                    // Navigation is asynchronous, so a still-unchanged position
                    // shortly after is the signal that the jump was ignored;
                    // stepping back one at a time is the slower route that only
                    // relies on back(), which is known to work here.
                    if (typeof window.setTimeout === 'function') {
                        window.setTimeout(function () {
                            if (readRouterIndex() === routerIndexNow) {
                                console.warn('tizen-adapter: go(-n) did nothing, stepping back instead');
                                recordExitAttempt(reading + ', go(' + -(added + 1) + ') ignored, stepped back');
                                stepBack(added + 1);
                            }
                        }, 300);
                    }
                    return;
                }

                if (typeof window.history.back === 'function') {
                    recordExitAttempt(reading + ', back()');
                    window.history.back();
                    return;
                }

                recordExitAttempt('failed: history has no back or go');
                console.warn('tizen-adapter: no way to exit, history has no back or go');
            } catch (err) {
                console.warn('tizen-adapter: exit failed', err);
            }
        }
    };

    var systeminfo = {
        // jellyfin-tizen wraps this in a Promise that only settles from the callback,
        // so the callback must always fire.
        getPropertyValue: function (property, successCallback, errorCallback) {
            if (typeof successCallback !== 'function') {
                return;
            }

            if (property === 'DISPLAY') {
                successCallback({
                    resolutionWidth: window.screen.width,
                    resolutionHeight: window.screen.height
                });
                return;
            }

            successCallback({});
        }
    };

    var tvinputdevice = {
        // TizenBrew registers the remote keys from the package.json "keys" array,
        // so these exist only because the wrapper calls them at startup.
        registerKey: function () {},
        unregisterKey: function () {}
    };

    window.tizen = {
        application: {
            getCurrentApplication: function () {
                return currentApplication;
            }
        },
        systeminfo: systeminfo,
        tvinputdevice: tvinputdevice
    };

    window.webapis = {
        productinfo: {
            is8KPanelSupported: function () {
                return false;
            },
            // The TV browser misreports devicePixelRatio, so this is assumed true.
            isUdPanelSupported: function () {
                return true;
            }
        }
    };

    var VERSION_BLOCK_ID = 'tizenAdapterVersionInfo';

    // jellyfin-web never surfaces its own version, or ours, anywhere in the user
    // settings. This injects a small info block there so it is visible from the
    // TV without opening a browser. It is entirely best-effort: if the anchor
    // jellyfin-web renders around the username heading ever changes, this must
    // fail silently rather than break the settings page for the user.
    //
    // Structured as a list of rows so future entries (e.g. a toggle) can be
    // appended without reshaping the block itself.
    // Reports what the previous exit attempt actually did, read back from
    // storage. Deliberately the last attempt rather than a prediction of the
    // next one: when exit succeeds the page is gone, so a prediction can only
    // ever be read in the case where exit failed, which is the half that needs
    // diagnosing least. This survives leaving the app and coming back.
    function describeLastExit() {
        var last = readLastExitAttempt();
        return last || 'not attempted yet';
    }

    function buildVersionRows() {
        return [
            { label: 'jellyfin-web', value: WEB_VERSION },
            { label: 'jellyfin-tizen', value: TIZEN_COMMIT },
            { label: 'Module', value: MODULE_VERSION },
            { label: 'Last exit', value: describeLastExit() },
            { label: 'Project', value: 'github.com/Pindagus/jellyfin-tizenbrew' }
        ];
    }

    function injectVersionInfo(root) {
        try {
            var doc = root || document;

            if (doc.getElementById(VERSION_BLOCK_ID)) {
                // Already injected, avoid duplicating the block on repeat navigation.
                return;
            }

            var headings = doc.querySelectorAll('h2.sectionTitle.headerUsername');
            if (!headings.length) {
                return;
            }

            var heading = headings[0];
            var section = heading.closest ? heading.closest('.verticalSection') : null;
            var anchor = section || heading;

            if (!anchor || !anchor.parentNode) {
                return;
            }

            var container = doc.createElement('div');
            container.id = VERSION_BLOCK_ID;
            container.className = 'verticalSection';
            container.style.padding = '0.5em 0.25em';
            container.style.marginTop = '0.5em';

            var rows = buildVersionRows();
            for (var i = 0; i < rows.length; i++) {
                var row = doc.createElement('div');
                row.className = 'fieldDescription secondaryText';
                row.style.fontSize = '0.9em';
                // The URL is shown as plain text rather than a clickable link: a
                // remote-driven focus ring on an <a> is awkward on a TV, whereas
                // text can simply be read and typed elsewhere.
                row.textContent = rows[i].label + ': ' + rows[i].value;
                container.appendChild(row);
            }

            anchor.parentNode.insertBefore(container, anchor.nextSibling);
        } catch (err) {
            console.warn('tizen-adapter: could not inject version info into settings', err);
        }
    }

    function startObserving() {
        try {
            if (typeof MutationObserver !== 'function' || typeof document === 'undefined') {
                return;
            }

            // A single body-level observer is cheap on TV hardware as long as the
            // callback itself stays cheap: it only ever does a targeted id lookup
            // and, at most, one querySelectorAll scoped to a small settings page.
            var observer = new MutationObserver(function () {
                injectVersionInfo(document);
            });
            observer.observe(document.body, { childList: true, subtree: true });

            // The settings page may already be rendered when a later navigation
            // re-runs this, so do not rely on a future mutation to trigger it.
            injectVersionInfo(document);
        } catch (err) {
            console.warn('tizen-adapter: could not observe DOM for settings injection', err);
        }
    }

    // The build injects this script into <head> without `defer`, so it runs
    // before <body> is parsed and document.body is still null at this point.
    // Observing a null node throws, which previously left the version block
    // silently uninjected for the whole session.
    if (typeof document !== 'undefined' && document.body) {
        startObserving();
    } else if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', startObserving);
    }

    // Exposed for tests and for callers that want to trigger injection directly
    // without waiting on the observer.
    window.__tizenAdapterInjectVersionInfo = injectVersionInfo;
})();
