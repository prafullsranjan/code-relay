# CodeRelay

CodeRelay is a multi-service collaborative coding workspace. It combines a Next.js web app, a Fastify API, a Yjs/Hocuspocus collaboration server, and a BullMQ/Kubernetes-backed executor so a workspace can support shared editing, guest invites, and isolated code runs.

## What It Does

- Create workspaces with `LOCAL` or `GHE_BOUND` access modes.
- Invite guests into `LOCAL` workspaces with single-use, hashed invite tokens.
- Share editor state in real time with Yjs.
- Queue and execute code runs through BullMQ.
- Persist run events and fan them out over Redis.
- Orchestrate runner Jobs in Kubernetes with a hardened security context.
- Rename workspaces from the editor toolbar (owner only).
- Pre-select a programming language when creating a guest session from the home page.
- Persist editor code and stdin across page reloads via `localStorage`.
- Replay only the most recent run's output on reconnect — no stale history.

## Services

- `apps/web` - Next.js UI for workspace creation and workspace interaction.
- `apps/api` - Fastify API for workspaces, invites, guest sessions, and run requests.
- `apps/collab` - Hocuspocus/Yjs collaboration server and run-event websocket fan-out.
- `apps/executor` - BullMQ worker that creates runner Jobs and updates run status.
- `packages/shared` - Shared TypeScript types and auth contracts.

## Web UI Features

### Home page

- **Hero image** — full-width hero banner served from `apps/web/public/hero.png`.
- **How It Works** — four-step horizontal card strip with colored icon badges.
- **Supported languages grid** — visual chips for all 15 runtimes with brand icons and colours.
- **New Workspace card** — pick a name and mode (`Personal` / `Team`) and create a workspace in one click.
- **Guest Session card** — pick a session name and a programming language (all 15 languages including JSON and XML); the chosen language is pre-selected when the workspace opens. The generated invite link can be copied or opened directly.
- **My Workspaces** — expandable list of the owner's existing workspaces.
- **Dark / light mode** — persisted to `localStorage` per browser.

### Static pages

- **`/docs`** — in-app documentation covering features, API, and services.
- **`/privacy`** — privacy policy (data collection, cookies, retention).
- **`/contact`** — team info and project links.
- **`/github`** — server-side 302 redirect to the project GitHub profile.

### Workspace editor

- **Monaco editor** — full syntax highlighting for every supported language, collaborative cursors via Yjs awareness.
- **File tabs** — add, close, and **double-click to rename** files inline.
- **Workspace title** — owner can **double-click the title** in the toolbar to rename it; change is persisted to the API.
- **Language badge** — solid pill badge coloured with the language's brand colour.
- **Share dropdown** — copy the workspace URL or generate a one-hour guest invite link.
- **Run output** — streams stdout, stderr, and system events in real time. On reload, only the last run's output is replayed. Build output is cleared automatically on every language switch.
- **Code persistence** — editor content and stdin are saved to `localStorage` and restored on reload. Each language's code is preserved independently in memory; switching languages and back restores the previous code.
- **Beautify / Format** — wand-icon button normalises whitespace and trailing blanks for all languages; for JSON validates and pretty-prints; for XML validates well-formedness and re-indents. Uses `model.pushEditOperations` so the action is undoable and propagates to all collaborators.
- **Minify** — compress-icon button (shown for JSON and XML only) collapses content to a single line.
- **Resizable panels** — drag the horizontal splitter (editor ↔ output) and the two vertical handles (editor ↕ build output, stdin ↕ run output).
- **End Session modal** — owner gets a confirmation dialog before the workspace is permanently deleted.
- **Light / dark theme toggle** — affects Monaco theme and all panel chrome. Theme changes animate with a 0.25 s transition.

## Supported Languages

| Language | Runtime | Entry file | Notes |
|---|---|---|---|
| HTML | HTML5 (client-side preview) | `index.html` | Rendered in iframe, no executor |
| Python | Python 3.12 | `main.py` | |
| JavaScript | ES2024 (Node.js) | `index.js` | |
| Java | Java 21 (JDK) | `Main.java` | |
| C | C17 / GCC 14 | `main.c` | |
| C++ | C++23 / GCC 14 | `main.cpp` | |
| PHP | PHP 8.3 | `main.php` | Requires `php` binary on local runner |
| C# | C# 12 / .NET 8 | `Program.cs` | Requires `dotnet` SDK on local runner |
| Assembly | NASM 2.16 (x86-64) | `main.asm` | Requires `nasm` on local runner |
| Lua | Lua 5.4 | `main.lua` | Requires `lua` binary on local runner |
| Node.js | Node.js v20 LTS | `index.js` | |
| Groovy | Apache Groovy 4.0 | `main.groovy` | Requires `groovy` binary on local runner |
| Ruby | Ruby 3.3 | `main.rb` | |
| JSON | JSON5 / RFC 8259 | `data.json` | Validate, pretty-print, minify only — no executor |
| XML | XML 1.0 / 1.1 | `data.xml` | Validate, pretty-print, minify only — no executor |

HTML, JSON, and XML are handled entirely in the browser; all other languages queue a BullMQ job on the executor.

## Architecture

High-level flow:

1. An owner creates a workspace from the web app.
2. The API stores workspace metadata in Postgres.
3. For `LOCAL` workspaces, the owner can create a guest invite.
4. A guest redeems the invite and receives a `guest_session` cookie.
5. The editor syncs through Yjs over WebSocket.
6. A run request creates a `Run` row and a BullMQ job.
7. The executor creates a Kubernetes Job and emits run events.
8. Run events are stored in Postgres and broadcast through Redis.

The architecture and security boundaries are documented in:

- [docs/ARCH.md](docs/ARCH.md)
- [docs/SECURITY.md](docs/SECURITY.md)

## Workspace Modes

- `LOCAL` - Owner access plus guest invite support.
- `GHE_BOUND` - Owner-only. Guest invites and guest websocket access are blocked.

## API Endpoints (summary)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/workspaces` | List owner's workspaces |
| `POST` | `/api/workspaces` | Create a workspace |
| `GET` | `/api/workspaces/:id` | Fetch workspace metadata |
| `PATCH` | `/api/workspaces/:id` | Rename workspace title (owner only) |
| `DELETE` | `/api/workspaces/:id` | Delete workspace and end session (owner only) |
| `POST` | `/api/workspaces/:id/invites` | Create a guest invite |
| `POST` | `/api/workspaces/:id/runs` | Trigger a code run |
| `POST` | `/api/runs/:runId/cancel` | Cancel a running job |
| `GET` | `/api/runs/:runId/events` | Poll run events (SSE-style) |

## Prerequisites

- Node.js 22+
- pnpm 11.1.2+
- PostgreSQL 16+
- Redis 7+

Optional, if you want to run the local stack with containers instead of Homebrew:

- Docker and Docker Compose

## Local Setup

There are two supported local setups: Homebrew services or Docker Compose. The Homebrew flow is the one validated in this workspace.

### Option 1: Homebrew services

1. Start Redis and PostgreSQL:

   ```bash
   brew services start redis
   brew services start postgresql@16
   ```

2. Create the local database and role if they do not already exist:

   ```bash
   createuser coderelay || true
   createdb -O coderelay coderelay || true
   psql -d postgres -c "ALTER ROLE coderelay WITH LOGIN PASSWORD 'coderelay';"
   ```

3. Create a root `.env` file with these values:

   ```env
   DATABASE_URL=postgresql://coderelay:coderelay@localhost:5432/coderelay?schema=public
   REDIS_URL=redis://localhost:6379
   OWNER_DEV_ID=owner-dev-1
   OWNER_DEV_EMAIL=owner@local.dev
   INVITE_SECRET_PEPPER=dev-pepper
   PORT=3001
   MAX_RUNS_PER_MIN=30
   MAX_CONCURRENT_RUNS=3
   RUN_TIMEOUT_MS=20000
   RUNNER_RUNTIME_CLASS=kata-fc
   NODE_ENV=development
   ```

4. Install dependencies and prepare Prisma:

   ```bash
   pnpm install
   pnpm prisma generate
   pnpm prisma db push
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

6. Restart all server and app:

   ```bash
   for p in 3000 3001 3002 3003 3004; do pid=$(lsof -tiTCP:$p -sTCP:LISTEN); [ -n "$pid" ] && kill -9 $pid; done npm run dev
   ```

### Option 2: Docker Compose

If Docker is available, the repository includes a `docker-compose.yml` with Postgres and Redis:

```bash
docker compose up -d
pnpm install
pnpm prisma generate
pnpm prisma db push
npm run dev
```

## Ports

- Web: `http://localhost:3000`
- API: `http://localhost:3001`
- Collab: `ws://localhost:3002`
- Postgres: `localhost:5432`
- Redis: `localhost:6379`

## Root Commands

Run these from the repository root:

```bash
pnpm install       # install all workspace dependencies
pnpm prisma generate
pnpm prisma db push
npm run dev        # start all services in parallel
npm run build      # build all services
npm run test       # run workspace tests
npm run lint       # lint workspace packages
npm run format     # format all files with Prettier
```

## Package Commands

### Web

```bash
pnpm --filter @coderelay/web dev
pnpm --filter @coderelay/web build
```

### API

```bash
pnpm --filter @coderelay/api dev
pnpm --filter @coderelay/api test
```

### Collab

```bash
pnpm --filter @coderelay/collab dev
```

### Executor

```bash
pnpm --filter @coderelay/executor dev
```

## Environment Variables

The root app reads these variables:

- `DATABASE_URL` - Postgres connection string.
- `REDIS_URL` - Redis connection string.
- `OWNER_DEV_ID` - Default owner identity in local development.
- `OWNER_DEV_EMAIL` - Default owner email in local development.
- `INVITE_SECRET_PEPPER` - Secret pepper for invite token hashing.
- `PORT` - API port.
- `MAX_RUNS_PER_MIN` - Workspace run rate limit.
- `MAX_CONCURRENT_RUNS` - Workspace concurrent run limit.
- `RUN_TIMEOUT_MS` - Default runner timeout.
- `RUNNER_RUNTIME_CLASS` - Kubernetes runtime class for runner Jobs.
- `NODE_ENV` - Runtime environment.

The web app also supports:

- `NEXT_PUBLIC_API_BASE` - Override the API base URL.
- `NEXT_PUBLIC_COLLAB_WS_BASE` - Override the collaboration websocket base URL.

## Data Model

The Prisma schema models:

- `Workspace`
- `Invite`
- `GuestSession`
- `Run`
- `RunEvent`
- `AuditEvent`

The canonical schema lives in [prisma/schema.prisma](prisma/schema.prisma).

## Security Notes

- Invite tokens are hashed before being stored.
- Invite redemption is atomic and single-use.
- Guest sessions are scoped to a workspace.
- Runner Jobs use a locked-down container security context.
- `GHE_BOUND` workspaces disallow guest access.

## Troubleshooting

### `pnpm` not found

Install pnpm through Corepack or your package manager and ensure it is on `PATH`.

### `DATABASE_URL` missing

Create the root `.env` file described above before starting the app.

### `PrismaClientInitializationError`

Run:

```bash
pnpm prisma generate
pnpm prisma db push
```

### Port already in use

The app expects:

- API on `3001`
- Collab on `3002`
- Web on `3000`

Stop stale listeners before restarting `npm run dev`.

### Local runner: PHP / Lua / Groovy / C# / Assembly not executing

These runtimes are not installed by default on macOS. When one is missing the executor emits a clear `[CodeRelay]` error message in the Build Output with install instructions:

| Language | Install (macOS) | Install (Linux) |
|---|---|---|
| PHP | `brew install php` | `apt-get install php` |
| Lua | `brew install lua` | `apt-get install lua5.4` |
| Groovy | `brew install groovy` | `sdk install groovy` (SDKMan) |
| .NET (C#) | [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) | same |
| NASM (Assembly) | `brew install nasm` | `apt-get install nasm` |

All five runtimes are present in the Kubernetes images used in production.

### `EMFILE: too many open files`

This is a Next.js watcher issue on macOS. If it appears during development, restart the dev server after closing duplicate runs, or increase the file descriptor limit in your shell.

## Relevant Docs

- [docs/ARCH.md](docs/ARCH.md)
- [docs/RUNBOOK.md](docs/RUNBOOK.md)
- [docs/SECURITY.md](docs/SECURITY.md)
