# Architecture

```text
apps/desktop       Electron shell
apps/web           Next.js app, API routes and Prisma database
packages/shared    Shared types and protocol helpers
scripts            Development, validation and packaging scripts
assets             Icons and product preview images
tests              Repository quality gates
```

## Frontend

The web UI is built with Next.js and organized around feature modules. Shared UI primitives live in `apps/web/src/components/ui`.

## Backend

Local API routes live in `apps/web/src/app/api`. Runtime helpers and API response utilities live in `apps/web/src/server`.

## Database

Botdeck uses SQLite with Prisma for local storage and indexed message data.

## Desktop

The Electron shell lives in `apps/desktop` and loads the local Botdeck web runtime.
