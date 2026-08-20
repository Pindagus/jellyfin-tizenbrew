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

    // How deep the history was when this module was loaded, captured before
    // jellyfin-web has had any chance to navigate. Exiting means returning to
    // exactly this depth, so it has to be read now rather than on exit.
    var HISTORY_DEPTH_AT_LOAD = (window.history && typeof window.history.length === 'number')
        ? window.history.length
        : 0;

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
            // lands on a jellyfin page instead of the launcher. Jumping by the
            // number of entries added since load clears the whole app in one go.
            try {
                if (!window.history) {
                    console.warn('tizen-adapter: no way to exit, window.history is unavailable');
                    return;
                }

                var added = 0;
                if (typeof window.history.length === 'number' && HISTORY_DEPTH_AT_LOAD > 0) {
                    added = window.history.length - HISTORY_DEPTH_AT_LOAD;
                }

                // history.go(-n) needs n entries to actually exist. Guarding on
                // `added` rather than trusting the arithmetic keeps a negative or
                // zero value (a browser that caps history.length, or an exit
                // before any navigation) on the plain single-step path.
                if (added > 0 && typeof window.history.go === 'function') {
                    window.history.go(-(added + 1));
                    return;
                }

                if (typeof window.history.back === 'function') {
                    window.history.back();
                    return;
                }

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
    function buildVersionRows() {
        return [
            { label: 'jellyfin-web', value: WEB_VERSION },
            { label: 'jellyfin-tizen', value: TIZEN_COMMIT },
            { label: 'Module', value: MODULE_VERSION },
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
