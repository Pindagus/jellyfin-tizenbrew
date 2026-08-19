# Jellyfin for TizenBrew

Runs the Jellyfin web client on a Samsung Tizen TV through
[TizenBrew](https://github.com/reisxd/TizenBrew), without a sideloaded `.wgt` and
without a developer certificate that expires every 90 days.

## Installation

Open TizenBrew on the TV, press the green button, choose to add via NPM and enter:

```
@pindagus/jellyfin-tizenbrew
```

That is the released package and the one to use. It always resolves to the latest
release, never to a development build.

> **Not published yet.** The npm package is not live at the moment, so this route
> does not work today.

### Development builds

Development builds are published to npm under the `dev` dist-tag:

```
@pindagus/jellyfin-tizenbrew@dev
```

Enter that once and it keeps pointing at the newest development build. Because
these are semver prereleases, they never satisfy an unqualified install, so the
line above is the only way to reach them. They can be broken at any moment.

Adding via GitHub instead installs from the `dist` branch, which is rebuilt on
every run of the build workflow:

```
Pindagus/jellyfin-tizenbrew@dist
```

Prefer the `dev` tag over this one. jsDelivr caches branch URLs for around 12
hours and refreshes files independently of each other, so a freshly built `dist`
can serve a mix of two builds. npm versions are immutable and do not have that
problem.

## How it works

Nothing from Jellyfin is vendored. Every build clones fresh:

- `jellyfin/jellyfin-web` at the latest release tag
- `jellyfin/jellyfin-tizen`, the official Tizen wrapper, at `master`

That way, upstream Tizen patches come along automatically.

The only project-owned code is `tizen-adapter.js`. The wrapper normally loads
`$WEBAPIS/webapis/webapis.js`, a placeholder that only resolves inside an installed
`.wgt`. That path does not exist in TizenBrew, so the build replaces the reference
with our adapter, which mimics the Tizen APIs the wrapper actually uses.

The patches deliberately warn instead of failing when upstream renames something, so
that a rename does not break the whole pipeline. To keep that from shipping a package
that looks complete but does not start, `scripts/verify-build.sh` inspects the result
and fails the build if it would not run on the TV. It checks content rather than mere
presence, so an empty wrapper or a `package.json` missing its TizenBrew fields is
caught before publishing.

## Versioning

Releases are numbered `<module>+jellyfin-web.<upstream>`, for example
`1.0.0+jellyfin-web.10.11.11`. The first part is this module's own semver and moves
when the module changes; the part after the plus is semver build metadata naming the
jellyfin-web release inside. Both numbers are also shown on the settings page in the
client, so you can tell from the TV which build you are running.

Development builds add a prerelease suffix carrying the CI run number, as in
`1.0.0-dev.42+jellyfin-web.10.11.11`. The module version stays where it is; only
the suffix moves, so testing never advances the release number.

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
- Hardware decoding has not been compared against a real sideloaded `.wgt`.
- Exiting steps back in history to reach the TizenBrew launcher. The launcher is
  widget-local content rather than something served over HTTP, so it cannot be
  reached by URL from the module. This route is derived from TizenBrew's own source
  rather than a documented API, and has not yet been confirmed on hardware.

## Related work

- [jeppevinkel/jellyfin-tizen-builds](https://github.com/jeppevinkel/jellyfin-tizen-builds): `.wgt` builds to sideload. Use that if you are not running TizenBrew.
- [GlenLowland/jellyfin-tizen-npm-publish](https://github.com/GlenLowland/jellyfin-tizen-npm-publish): the previous TizenBrew package, unmaintained since 2024.

## License

[Mozilla Public License 2.0](LICENSE), matching the license of upstream
`jellyfin-tizen`.
