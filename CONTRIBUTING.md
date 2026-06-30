# Contributing

## Setup

```sh
npm ci
npm --prefix apps/web run db:generate
npm run db:migrate
npm run dev
```

## Before opening a change

```sh
npm run check
npm run build
npm run package:check
```

## Guidelines

- Keep shared UI in `apps/web/src/components/ui`.
- Keep feature code inside `apps/web/src/features`.
- Keep API responses consistent with `apps/web/src/server/api-response.ts`.
- Never commit Discord tokens, local databases, generated release builds or `.botdeck/` runtime files.
