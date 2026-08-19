# Jellyfin for TizenBrew

Runs the Jellyfin web client on a Samsung Tizen TV through
[TizenBrew](https://github.com/reisxd/TizenBrew), without a sideloaded `.wgt` and
without a developer certificate that expires every 90 days.

## Installation

Open TizenBrew on the TV, press the green button and add via GitHub:

```
Pindagus/jellyfin-tizenbrew@dist
```

Or via npm:

```
@pindagus/jellyfin-tizenbrew
```

Both installation paths depend on the source repository being public: jsDelivr
(which TizenBrew uses to fetch the package) only serves public GitHub repos. The
`dist` branch also does not exist yet, it is created by the build workflow on its
first run, which has not happened yet at the time of writing.

## How it works

Nothing from Jellyfin is vendored. Every build clones fresh:

- `jellyfin/jellyfin-web` at the latest release tag
- `jellyfin/jellyfin-tizen`, the official Tizen wrapper, at `master`

That way, upstream Tizen patches come along automatically.

The only project-owned code is `tizen-adapter.js`. The wrapper normally loads
`$WEBAPIS/webapis/webapis.js`, a placeholder that only resolves inside an installed
`.wgt`. That path does not exist in TizenBrew, so the build replaces the reference
with our adapter, which mimics the Tizen APIs the wrapper actually uses.

After assembling `dist-build/`, `scripts/verify-build.sh` checks whether the result
would actually run on the TV, and fails hard if it would not. It checks content, not
just presence: that `package.json` carries the TizenBrew fields (`packageType`,
`appName`, `appPath`, `keys`), that the `$WEBAPIS` placeholder was really replaced,
that the wrapper (`tizen.js`) and the adapter are not empty or truncated, that the
version stamp was applied to `tizen-adapter.js`, and that `www/` contains at least
500 files (a real build produces around 1242). This exists because the patches in
`scripts/build.sh` warn instead of fail when a pattern is not found, so an upstream
rename does not silently break the pipeline, it fails visibly at the verification
step instead.

## Branches

- `main`: source, workflows, docs. Pull requests land here.
- `dist`: build output only, overwritten on every build. Do not edit by hand.

## Building locally

```bash
npm install
npm test
npm run build
```

Without a build having run, `npm test` skips the package-metadata tests (there is
nothing in `dist-build/` yet to check). Run `REQUIRE_DIST_BUILD=1 npm test` to make
those tests fail hard instead of skipping when the build is missing, which is
exactly what CI does.

The output goes into `dist-build/`. `npm run build` invokes `scripts/build.sh`,
which ends by running `scripts/verify-build.sh`; the build fails if verification
does not pass.

## Contributing

Patches on top of upstream are `patch_file` calls in `scripts/build.sh`. Each patch
warns instead of failing when upstream renames the target pattern, so an upstream
change does not break the build, but does become visible in the build log.

## Known limitations

- No DRM. TizenBrew does not request the `drmplay` privilege.
- Exiting the app back to TizenBrew is not solved yet. The wrapper calls
  `tizen.application.getCurrentApplication().exit()`, but our shim cannot do
  anything meaningful there: the module runs inside TizenBrew and has no widget of
  its own to close. This was also a reported complaint against the previous,
  abandoned package.
- Fullscreen behavior and hardware decoding inside TizenBrew's container have not
  been verified against a real sideloaded `.wgt`.

None of the above has been confirmed on an actual TV yet; that verification is a
separate, manual step.

## Related work

- [jeppevinkel/jellyfin-tizen-builds](https://github.com/jeppevinkel/jellyfin-tizen-builds): `.wgt` builds to sideload. Use that if you are not running TizenBrew.
- [GlenLowland/jellyfin-tizen-npm-publish](https://github.com/GlenLowland/jellyfin-tizen-npm-publish): the previous TizenBrew package, unmaintained since 2024.

## License

[Mozilla Public License 2.0](LICENSE), matching the license of upstream
`jellyfin-tizen`.
