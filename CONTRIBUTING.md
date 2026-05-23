# Contributing

## Prerequisites

- **Bun** (runtime/package manager)
- **Redis** (for integration testing; unit tests mock Redis)
- **Node.js** 20+ (for running changesets publisher locally)

## Setup

```
bun install
```

## Development

```
bun test                  # run all tests
bun run build             # build JS bundle to dist/
bun run build:types       # generate type declarations to dist/
npx prettier --write src/ # format code
```

Pre-commit hook runs `bun test` then prettier on staged files.

## Versioning (Changesets)

This repo uses [Changesets](https://github.com/changesets/changesets).

1. Run `npx changeset`
2. Select version bump type
3. Write summary
4. Commit the generated `.md` file in `.changeset/`

Changesets do not auto-commit (`commit: false` in config).

## Release workflow

On merge to `main` with a changeset, CI (`.github/workflows/release.yml`):

1. Opens or updates a **Version PR** that bumps versions + updates changelog
2. Merging the Version PR triggers `bun run release` which builds and publishes to **GitHub Packages**

## Manual publish (maintainers only)

If CI is unavailable:

```
bun install
bun run build
bun run build:types
npx changeset publish
```

Requires `~/.npmrc` configured for GitHub Packages:

```
@asdfsena:registry=https://npm.pkg.github.com/
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
```

## Pull requests

- Ensure `bun test` passes and `bun run build` succeeds
- Include a changeset if changing public API or behavior
- Format with prettier before pushing (pre-commit does this)
