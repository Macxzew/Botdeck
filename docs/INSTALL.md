# Installation

## Requirements

- Node.js `24.17.0` recommended.
- npm `>=10 <12`.
- A Discord application with a bot account.
- A Discord test server.

Botdeck supports Node.js `>=22.16.0 <25`.

## Setup

```shell
npm ci
npm --prefix apps/web run db:generate
npm run db:migrate
```

## Development

```shell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Desktop app

```shell
npm run app
```

## Local files

Botdeck stores runtime data locally. Do not commit `.botdeck/`, local databases, generated TLS material, or release builds.
