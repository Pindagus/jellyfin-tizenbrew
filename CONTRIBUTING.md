# Contributing

## How the build works

Nothing from Jellyfin is vendored. Every build clones fresh, at the versions
`versions.json` pins:

- `jellyfin/jellyfin-web` at a release tag
- `jellyfin/jellyfin-tizen`, the official Tizen wrapper, at a commit

Pinning rather than always taking the newest is what makes an old release
reproducible. A daily workflow proposes new pins by pull request, so upstream
changes still arrive on their own, but only after passing through a build that
can be tested.

The only project-owned code is `tizen-adapter.js`. The wrapper normally loads
`$WEBAPIS/webapis/webapis.js`, a placeholder that only resolves inside an
installed `.wgt`. That path does not exist in TizenBrew, so the build replaces
the reference with our adapter, which mimics the Tizen APIs the wrapper actually
uses.

Patches on top of upstream are `patch_file` calls in `scripts/build.sh`. Each
one warns instead of failing when upstream renames the target pattern, so an
upstream change does not break the whole pipeline, but does become visible in
the build log.

That leniency could ship a package that looks complete but does not start, so
`scripts/verify-build.sh` inspects the result and fails the build if it would
not run on the TV. It checks content rather than mere presence: an empty wrapper
or a `package.json` missing its TizenBrew fields is caught before publishing.

## Leaving the app

`appHost.exit()` has to return to the TizenBrew launcher, which turns out to be
the hardest thing the adapter does. TizenBrew launches a module with
`location.href` and offers nothing to reverse it: no global on `window`, no
postMessage listener, no WebSocket event. The launcher is widget-local content,
so navigating to its path over HTTP reaches the module's own proxy instead and
renders a bare IP address.

Walking back through history is the only route, and it has to cover every entry
jellyfin-web added, since a single-page app pushes one per view. Three things
about the TV rule out the shorter ways of writing that, each established by
testing on the device rather than by reasoning:

- `history.go(-n)` is ignored outright. It fails silently, which is worse than
  useless: the user is left with no way out of the app at all.
- `history.state.idx`, react-router's own position counter, is not set yet. The
  adapter replaces `webapis.js` and so runs before jellyfin-web boots.
- No launcher hook exists on `window` to defer to.

What remains is `history.length` measured at load, and one `back()` per entry
with a short pause between them, because navigation does not complete
synchronously. Anything cleverer was tried and reverted.

## Building locally

```bash
npm install
npm test
npm run build
```

Requires Node 22: jellyfin-web pins `npm <11`, which newer Node ships.

Output goes into `dist-build/`. `npm run build` invokes `scripts/build.sh`,
which ends by running `scripts/verify-build.sh`; the build fails if verification
does not pass.

Without a build having run, `npm test` skips the package-metadata tests (there
is nothing in `dist-build/` to check). `REQUIRE_DIST_BUILD=1 npm test` makes
those fail hard instead of skipping, which is what CI does.

A local build is versioned `0.0.0-local`. The real number is decided after the
build, by semantic-release, which then calls `scripts/set-version.sh` to write
it into the manifest and the adapter.

## Branches

- `main`: releasable. Landing here publishes to the `latest` dist-tag.
- `dev`: where work and upstream bumps land, published as prereleases to `@dev`.

## Versioning

Versions are decided by semantic-release from the commit history, not by anyone
typing a number. Conventional-commit types map onto the bump: `fix` gives a
patch, `feat` a minor, and a `!` or `BREAKING CHANGE` a major. Commits that
release nothing (`docs`, `chore`, `style`) build and verify but publish nothing,
which is the intended outcome rather than a failure.

The version number says nothing about which jellyfin-web is inside; npm offers
no way to encode that. What a release contains is recorded in its `package.json`
as `jellyfinWeb` (a version) and `jellyfinTizen` (a commit, since that
repository publishes no versions at all). Nothing from Jellyfin is vendored, so
those two fields are the only record of what a build was made from, and
`versions.json` pins what the next one will use.

Prereleases are numbered `1.1.0-dev.1`, `1.1.0-dev.2` and so on. They never
satisfy an unqualified install, which is what keeps them off `latest` while
remaining installable as `@dev`.

## How a release happens

```
daily check finds jellyfin-web 10.12.0
  -> pull request on dev: "feat: bump jellyfin-web v10.11.11 to v10.12.0"
  -> merge it
  -> 1.1.0-dev.1 published to the npm dev dist-tag
  -> test it on the TV
  -> promote dev to main
  -> 1.1.0 published to latest, with a GitHub release and notes
```

The check writes the commit type to match how far upstream moved, so a
jellyfin-web minor arrives as `feat` and becomes a minor here. Editing the
commit subject before merging changes that, which is how a release gets a bigger
number than upstream alone would justify.

There is no `CHANGELOG.md`, by choice. Release notes live on the releases page,
which is where anyone looking for them goes, and keeping a copy in the
repository would mean semantic-release pushing a commit to `main` on every
release. That push is exactly what `main`'s ruleset blocks, and the standard
`GITHUB_TOKEN` cannot be granted a bypass on a user-owned repository, so the
file would cost either the protection or a long-lived credential. semantic-release
itself ships without one for the same reason.

Publishing runs over npm trusted publishing: the workflow exchanges a
short-lived OIDC token for publish rights, so no long-lived token exists in this
repository. npm attaches a provenance statement and rejects the upload unless
the manifest's `repository` field names this repository, which is why
`scripts/build.sh` writes it.

## Server compatibility

jellyfin-web declares the oldest server it will talk to (`MINIMUM_VERSION` in
`@jellyfin/sdk`), currently `10.10.0`, and refuses to connect below it rather
than degrading quietly. One build therefore covers both current server lines,
which is why there is no separate 10.10 package.

The build reads that constant on every run and warns when upstream raises it.
That is the point where users on older servers would be stranded, and where a
second package pinned to the previous jellyfin-web becomes worth publishing.
