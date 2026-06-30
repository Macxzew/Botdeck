# Release process

Run the full release validation before packaging:

```shell
npm run release:check
```

This includes quality checks, build validation, packaging checks, and production audit checks.

## Package desktop builds

```shell
npm run build-win
npm run build-lin
npm run build-mac
```

All desktop targets:

```shell
npm run build-all
```

Packages are written to `release/`.
