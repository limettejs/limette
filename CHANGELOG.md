# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/)
and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Added

### Changed

### Fixed

## [0.2.3] - 2025-06-28

### Fixed

- Don't patch fetch with node-fetch

## [0.2.2] - 2025-02-13

### Fixed

- File system routes should be order by specificity

## [0.2.1] - 2025-02-10

### Added

- Export `getCookies`, `setCookie`, `deleteCookie`, `HttpError` and `IS_BROWSER` utilities

## [0.2.0] - 2025-01-24

### Changed

- BREAKING: Use Tailwind v4 by default

## [0.1.2] - 2025-01-21

### Fixed

- Tailwind plugin should also scan app wrapper and layouts for islands

## [0.1.1] - 2025-01-20

### Fixed

- Tailwind plugin should also scan app wrapper and layouts for styles

## [0.1.0] - 2025-01-19

### Added

- Added support for `Error Pages`
- Added support for `port` and other Deno.serve() options
- Added support for `target` for JS assets
- Added `ContextMixin` to access the Context
- Added time duration for starting or building the app in the console

### Changed

- BREAKING: Use FS Routes as a plugin
- BREAKING: Use Tailwind as a plugin
- BREAKING: Change `Middleware`'s signature
- BREAKING: Change `Context`'s shape
- BREAKING: Remove `disableLightDom` option to disable light DOM for server components
- BREAKING: Remove `<is-land>` wrapper
- BREAKING: Rename `AppRoot` to `AppWrapper`
- BREAKING: Rename `no-tailwind` to `skip-tailwind`
- Replace Oak router with a custom router
- Disable Tailwind logs

### Fixed

- Include reload mechanism in dev mode, even if there is no JS bundle to include

## [0.0.19] - 2025-01-07

### Added

- Add support for `Middlewares`
- Add support for `Layouts`
- Add `params` property to LimetteContext

### Changed

- BREAKING: rename `req` property to `request` for LimetteContext

### Fixed

## [0.0.18] - 2024-12-04

### Added

- Add `disableLightDom` option to disable light DOM for server components

### Changed

- BREAKING: Enable by default light DOM rendering for server components
- Update Lit version
- Update Tailwind version

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
