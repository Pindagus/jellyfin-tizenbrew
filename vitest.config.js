import { defineConfig } from 'vitest/config';

// Without an explicit include, vitest walks the whole tree and picks up the
// test suites inside .build-work/ (a full jellyfin-web checkout), which expect
// a browser environment and fail. That only happens after a local build has
// run, so CI never saw it while `npm test` broke for anyone building locally.
export default defineConfig({
    test: {
        include: ['test/**/*.test.js']
    }
});
