# Quick Start Guide

## Local Development

`make install`        # Install dependencies

`make dev`            # Start with hot reload

`make check`          # Run all quality gates (lint → typecheck → test)

## Docker (with Ollama)

`make docker-build`   # Build production image

`make docker-up`      # Start engine + Ollama sidecar

`make docker-logs`    # Watch the logs

## CI/CD

Everything runs on GitHub Actions; there is no other CI.

- `.github/workflows/build-packages.yml` — on push to `main` and on pull requests: builds the DEB and RPM to prove packaging still works.
- `.github/workflows/release.yml` — on a `v*.*.*` tag: builds the standalone binary natively on macOS arm64, macOS x64, Linux arm64 and Linux x64, smoke tests each one, and publishes them as release assets.

## Releasing

Releases are cut from a tag, and only from a tag.

```sh
make release                                   # verify: lint, typecheck, tests, build
git tag "v$(node -p "require('./package.json').version')"
git push github --tags
```

The tag must match the version in `package.json` — the binary bakes that version in at build time, so the release workflow fails rather than publish a mislabelled release.

A release is for something a user installs and runs. Documentation-only changes do not get their own tag; they sit on `main` and ship with the next code release.

## Prerequisites

`Node.js 20+` — required by the engines field in package.json

`Docker 27+` — for the multi-stage build and Compose v2

`fpm` — only needed to build DEB/RPM packages (`gem install fpm`)

## Testing

`npm test` — run the suite once

`npm run test:coverage` — run with a v8 coverage report

`npm run test:watch` — watch mode

## Installing

### Local Install (not publishing to npm)

```sh
   make install
   make build
   # use su/sudo/doas in case you don't have system permission
   npm link
```

### From a GitHub release

Download the tarball for your platform from the releases page and put the
`llmctrlx` binary on your `PATH`:

```sh
   tar -xzf llmctrlx-<version>-macos-arm64.tar.gz
   sudo cp llmctrlx-<version>-macos-arm64/llmctrlx /usr/local/bin/llmctrlx
```

### From DEB/RPM

```sh
   npm run build:deb
   npm run build:rpm
   # use su/sudo/doas in case you don't have system permission
   sudo dpkg -i dist/llmctrlx*.deb
   sudo rpm -i dist/llmctrlx*.rpm
```

### Manual macOS install from a local build

```sh
   chmod +x dist/llmctrlx-macos
   sudo cp dist/llmctrlx-macos /usr/local/bin/llmctrlx
```
