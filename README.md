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

> **No release yet.** Only a development build has been published so far, and npm
> always points `latest` at something, so an unqualified install currently
> returns that development build. The first real release fixes this for good:
> from then on `latest` only ever names a release.

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

### Staying on a specific build

Any published version can be entered directly and will never move:

```
@pindagus/jellyfin-tizenbrew@1.0.0
```

Useful for going back when a new release misbehaves. The release notes say which
jellyfin-web each version carries.

## How it works

Nothing from Jellyfin is vendored. Every build clones fresh, at the versions
`versions.json` pins:

- `jellyfin/jellyfin-web` at a release tag
- `jellyfin/jellyfin-tizen`, the official Tizen wrapper, at a commit

Pinning rather than always taking the newest is what makes an old release
reproducible. A daily workflow proposes new pins by pull request, so upstream
changes still arrive on their own, but only after passing through a build you
can test.

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

Versions are decided by semantic-release from the commit history, not by anyone
typing a number. Conventional-commit types map onto the bump: `fix` gives a
patch, `feat` a minor, and a `!` or `BREAKING CHANGE` a major.

The version does not encode which jellyfin-web is inside, because npm offers no
way to do that. Semver build metadata (`1.0.0+jellyfin-web.10.11.11`) looks like
the answer and is not: npm strips it on publish and ignores it when comparing
versions, so two builds against different jellyfin-web releases would collide as
one already-published version.

What a release contains is recorded in its `package.json` instead, as
`jellyfinWeb` (a version) and `jellyfinTizen` (a commit, since that repository
publishes no versions at all). Nothing from Jellyfin is vendored, so those two
fields are the only record of what a build was made from, and `versions.json` in
this repository pins what the next one will use. Both also appear on the settings
page in the client, so the TV can tell you what it is running.

### How a release happens

```
daily check finds jellyfin-web 10.12.0
  -> pull request on dev: "feat: bump jellyfin-web v10.11.11 to v10.12.0"
  -> you merge it
  -> 1.1.0-dev.1 published to the npm dev dist-tag
  -> you test it on the TV
  -> you promote dev to main
  -> 1.1.0 published to latest, with a GitHub release and notes
```

The check writes the commit type to match how far upstream moved, so a
jellyfin-web minor arrives as `feat` and becomes a minor here. Editing the
commit subject before merging changes that, which is how a release gets a
bigger number than upstream alone would justify.

Your own commits work the same way: a `fix:` on dev is a patch, a `feat:` is a
minor. Commits that release nothing (`docs`, `chore`, `style`) build and verify
but publish nothing, which is the intended outcome rather than a failure.

Prereleases are numbered `1.1.0-dev.1`, `1.1.0-dev.2` and so on. They never
satisfy an unqualified install, which is what keeps them off `latest` while
remaining installable as `@dev`.

## Supported servers

One build covers both current Jellyfin server lines. jellyfin-web declares the
oldest server it will talk to (`MINIMUM_VERSION` in `@jellyfin/sdk`), currently
`10.10.0`, and refuses to connect below it rather than degrading quietly. A
build against jellyfin-web 10.11 therefore serves servers on 10.10 and 10.11
alike, which is why there is no separate 10.10 package.

The build checks that constant on every run and warns when upstream raises it,
since that is the point where users on older servers would be stranded and a
second package pinned to the previous jellyfin-web becomes worth publishing.

## Branches

- `main`: releasable. Landing here publishes to the `latest` dist-tag.
- `dev`: where work and upstream bumps land, published as prereleases to `@dev`.
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

A local build is versioned `0.0.0-local`. The real number is decided after the
build, by semantic-release, which then calls `scripts/set-version.sh` to write it
into the manifest and the adapter. Run that script by hand to see what a given
version would produce.

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
