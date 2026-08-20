# Jellyfin for TizenBrew

A simple way to install Jellyfin on a Samsung TV and keep it up to date.

Getting Jellyfin onto a Tizen TV normally means building a `.wgt`, installing
Tizen Studio, putting the TV in developer mode and pushing the build over the
network. Then the certificate expires after 90 days and you do it again. This
package skips all of that: install it once through
[TizenBrew](https://github.com/reisxd/TizenBrew), and updates arrive the same
way every other TizenBrew module does.

Built on the shoulders of
[jeppevinkel/jellyfin-tizen-builds](https://github.com/jeppevinkel/jellyfin-tizen-builds),
whose build scripts showed how to get jellyfin-web running on Tizen in the first
place, and
[GlenLowland/jellyfin-tizen-npm-publish](https://github.com/GlenLowland/jellyfin-tizen-npm-publish),
which did this for TizenBrew before and has been unmaintained since 2024.

## Installation

Requires [TizenBrew](https://github.com/reisxd/TizenBrew) on the TV. Follow their
installation instructions first.

In TizenBrew, add a module via NPM and enter:

```
@pindagus/jellyfin-tizenbrew
```

Jellyfin then appears in the TizenBrew module list.

## Which jellyfin-web version you get

This package ships the official Jellyfin web client unchanged, so which version
you run is what matters for talking to your server. Every release states the
jellyfin-web version it carries, in its
[release notes](https://github.com/Pindagus/jellyfin-tizenbrew/releases) and on
the [npm page](https://www.npmjs.com/package/@pindagus/jellyfin-tizenbrew).

Check that against your own server: Jellyfin's own compatibility rules apply,
not anything this package adds. Releases follow jellyfin-web closely, so the
newest one generally suits a current server.

## Updates

New versions arrive through TizenBrew. Nothing needs reinstalling.

To go back when a release misbehaves, or to stay on a version that matches an
older server, enter a specific version, which never moves:

```
@pindagus/jellyfin-tizenbrew@1.2.3
```

### Testing upcoming versions

Development builds are published under the `dev` tag:

```
@pindagus/jellyfin-tizenbrew@dev
```

These have not been tried on a TV yet and can be broken at any moment. Use the
normal package unless you are helping to test something.

## What this actually installs

Nothing from Jellyfin is copied into this repository. Each release is built by
cloning the official [jellyfin-web](https://github.com/jellyfin/jellyfin-web)
and [jellyfin-tizen](https://github.com/jellyfin/jellyfin-tizen) at pinned
versions and adapting them to run inside TizenBrew. The only code written here
is a small adapter that stands in for the Tizen APIs the official wrapper
expects.

Every build is checked before publishing for the things that would stop it
loading on a TV, so a broken build fails in CI rather than on your television.

## Known limitations

- No DRM, so Netflix-style protected content will not play. TizenBrew does not
  request the `drmplay` privilege.
- Hardware decoding has not been compared against a sideloaded `.wgt`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how builds, versioning and releases
work.

Parts of this project were developed with AI assistance.

## License

[Mozilla Public License 2.0](LICENSE), matching upstream `jellyfin-tizen`.
