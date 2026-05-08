# Quick Start Guide

Use the commands below to get up and running. All commands assume you have dropped the release kit files into your repository root.

## Local Development

`make install`        # Install dependencies

`make dev`            # Start with hot reload

`make check`          # Run all quality gates (lint → typecheck → test)

## Docker (with Ollama)

`make docker-build`   # Build production image

`make docker-up`      # Start engine + Ollama sidecar

`make docker-logs`    # Watch the logs

## CI/CD

Push to GitLab. The pipeline automatically runs lint → test → build → Docker. Releases are triggered manually on main via the release:npm job.

## Publishing

`make release`        # Semantic release: version bump, changelog, npm publish, GitLab release

## Prerequisites

`Node.js 20+` — required by the engines field in package.json

`Docker 27+` — for the multi-stage build and Compose v2

`npm account` — with an access token configured as NPM_TOKEN in GitLab

## CI variables

GitLab Container Registry — enabled on your project for Docker image pushes

## NPM Extras

Run `npm test` to verify the scaffold compiles and all placeholder assertions pass.
Run `npm run` test:coverage to check that your source modules meet the 80/75/80/80 coverage thresholds.
Run `npm run` test:ui for the interactive Vitest dashboard in your browser.

## Installing

Installation can vary by operating system but this works on some things.

### Local Install (not publishing to npm)

```sh
   make install
   make build
   # use su/sudo/doas in case you don't have system permission
   npm link
```

### Local Install (publishing to npm)

```sh
   make install
   make build:deb
   make build:rpm
   # use su/sudo/doas in case you don't have system permission
   sudo dpkg -i dist/llmctrlx*.deb 
   sudo rpm -i dist/llmctrlx*.rpm

   # MacOS
   chmod +x dist/llmctrlx-macos
   sudo cp dist/llmctrlx-macos /usr/local/bin/llmctrlx
```
