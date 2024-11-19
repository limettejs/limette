# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.0.17] - 2024-11-20

### Changed

- BREAKING: Rename `AppTemplate` to `AppRoot`

### Fixed

- Make `window` available on server for registering web components
- Set the response status property returned by a custom handler
- Wrong file paths on windows #29

## [0.0.16] - 2024-11-12

### Fixed

- Islands imports now support `imports` config from deno.json
- Tailwind's version is now read from deno.json

## [0.0.15] - 2024-11-11

### Added

- Islands are automatically identified and there is no need to decorate them with the `island` attribute or the `<is-land>` wrappper

### Fixed

- Wrong export for `lit-element-hydrate-support.ts`

## [0.0.14] - 2024-11-04

### Changed

- BREAKING: Don't SSR islands by default, but use the `ssr` attribute to opt-in

## [0.0.13] - 2024-11-04

### Added

- Add support for `<lmt-head>` to control the `<head>` section

### Fixed

- Context is not updated between navigations
- Extract Tailwind CSS from `_app.ts`

## [0.0.12] - 2024-09-11

### Added

- Added support for custom handlers

### Changed

- BREAKING: Change style placeholder for `routes/\_app.ts`

## [0.0.11] - 2024-09-01

### Added

- BREAKING: Get full control over the html file using `routes/\_app.ts`

### Changed

- Upgrade Lit to 3.2.0

### Fixed

## [0.0.10] - 2024-08-26

### Added

- Build static routes

## [0.0.9] - 2024-08-21

### Added

- Minify JS and CSS files for production mode
- Enable sourcemaps for dev mode

### Changed

### Fixed

- Don't include the refresh mechanism for production mode

## [0.0.8] - 2024-08-21

### Changed

- Use static assets for deno task start

## [0.0.7] - 2024-08-13

### Fixed

- Updated pipeline

## [0.0.6] - 2024-08-03

### Changed

- Updated examples
- Use `@limette/core for imports

## [0.0.5] - 2024-08-03

### Fixed

- Use toFileUrl to fix dynamic imports

## [0.0.4] - 2024-08-03

### Fixed

- New dynamic import path

## [0.0.3] - 2024-08-02

### Fixed

- New dynamic import path

## [0.0.2] - 2024-08-01

### Fixed

- Update `--input` flag for Tailwind

## [0.0.1] - 2024-08-01

### Added

- The first version.
