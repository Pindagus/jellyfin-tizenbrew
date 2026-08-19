'use strict';

// Replaces Tizen's webapis.js inside TizenBrew, where the $WEBAPIS placeholder
// used by a packaged .wgt does not resolve.
(function () {
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

    window.tizen = {
        systeminfo: systeminfo
    };

    window.webapis = {};
})();
