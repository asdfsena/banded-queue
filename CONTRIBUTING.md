# Contributing

## Prerequisites

- Bun (runtime/package manager)
- Redis (for integration testing; unit tests mock Redis)

## Setup

```
bun install
```

## Development

```
bun test         # run all tests
npx prettier --write src/  # format code
```

Pre-commit hook runs `bun test` then prettier on staged files.

## Versioning (Changesets)

This repo uses [Changesets](https://github.com/changesets/changesets).

1. Run `npx changeset`
2. Select version bump type
3. Write summary
4. Commit the generated `.md` file in `.changeset/`

Changesets do not auto-commit (`commit: false` in config). Bump on release.

## Pull requests

- Ensure `bun test` passes
- Include a changeset if changing public API or behavior
- Format with prettier before pushing (pre-commit does this)
