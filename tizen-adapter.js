'use strict';

// Replaces Tizen's webapis.js inside TizenBrew, where the $WEBAPIS placeholder
// used by a packaged .wgt does not resolve.
(function () {
    // Replaced by the build workflow. MODULE_VERSION is our own semver for this
    // package, WEB_VERSION is the jellyfin-web version being bundled.
    var MODULE_VERSION = 'DEVELOPMENT';
    var WEB_VERSION = 'DEVELOPMENT';

    var currentApplication = {
        appInfo: {
            // jellyfin-tizen reads this as the "app version" for its API headers.
            // The web version is more meaningful there than our own module version.
            version: WEB_VERSION
        },
        exit: function () {
            // TizenBrew hosts this module with a full page navigation (no iframe),
            // not the launcher's own window, so there is no widget of our own to
            // close and no postMessage channel back to the launcher.
            //
            // TizenBrew's launcher (tizenbrew-ui/src/main.jsx) normally handles the
            // remote's Return key (keyCode 10009) itself and calls
            // tizen.application.getCurrentApplication().exit() only once it is back
            // at its own index.html. That listener does not exist while our module
            // is running, so we navigate back to the launcher's page ourselves,
            // which lets its own Return-key handling take over from there.
            //
            // This path is derived from reading TizenBrew's source, not confirmed
            // against a running instance, so it is deliberately defensive: prefer
            // an explicit hook if TizenBrew ever exposes one, otherwise fall back
            // to the navigation, and never throw either way.
            try {
                if (window.tizenbrew && typeof window.tizenbrew.exit === 'function') {
                    window.tizenbrew.exit();
                    return;
                }

                if (typeof window.location !== 'undefined') {
                    window.location.href = '/tizenbrew-ui/dist/index.html';
                    return;
                }

                console.warn('tizen-adapter: no way to exit, window.location is unavailable');
            } catch (err) {
                console.warn('tizen-adapter: exit navigation failed', err);
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

    try {
        if (typeof MutationObserver === 'function' && typeof document !== 'undefined') {
            // A single body-level observer is cheap on TV hardware as long as the
            // callback itself stays cheap: it only ever does a targeted id lookup
            // and, at most, one querySelectorAll scoped to a small settings page.
            var observer = new MutationObserver(function () {
                injectVersionInfo(document);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    } catch (err) {
        console.warn('tizen-adapter: could not observe DOM for settings injection', err);
    }

    // Exposed for tests and for callers that want to trigger injection directly
    // without waiting on the observer.
    window.__tizenAdapterInjectVersionInfo = injectVersionInfo;
})();
