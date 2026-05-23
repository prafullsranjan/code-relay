# Runbook

## Local Dev
1. Create a root `.env` file with local defaults:

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

2. Start Redis and PostgreSQL with Homebrew:

	```bash
	brew services start redis
	brew services start postgresql@16
	```

3. Create the local database and role once if they do not already exist:

	```bash
	createuser coderelay || true
	createdb -O coderelay coderelay || true
	psql -d postgres -c "ALTER ROLE coderelay WITH LOGIN PASSWORD 'coderelay';"
	```

4. Install dependencies and generate Prisma Client:

	```bash
	pnpm install
	pnpm prisma generate
	pnpm prisma db push
	```

5. Start the full app:

	```bash
	npm run dev
	```

	The services will come up on:
	- Web: `http://localhost:3000`
	- API: `http://localhost:3001`
	- Collab base (Hocuspocus): `ws://localhost:3002`
	- Run events stream: `ws://localhost:3002/runs?workspaceId=<workspace-id>`

## Tests
- `pnpm --filter @coderelay/api test`
- `pnpm test`

## Kubernetes Deploy
1. Build/push images for api, collab, executor, web.
2. `kubectl apply -f infra/k8s/base/namespaces.yaml`
3. Ensure Kata RuntimeClass exists and handler is valid for cluster.
4. `kubectl apply -f infra/k8s/base/runner-policies.yaml`
5. `kubectl apply -f infra/k8s/base/deployments.yaml`
6. `kubectl apply -f infra/k8s/base/services-ingress.yaml`

## Notes
- runner namespace is `code-relay-runners`.
- executor creates Jobs with `runtimeClassName=kata-fc` by default.

## Known Gotchas

### Fastify v5 `reply.redirect` signature change
Fastify v5 reversed the argument order of `reply.redirect`:
- **v3/v4 (old):** `reply.redirect(statusCode, url)` — e.g. `reply.redirect(302, '/path')`
- **v5 (current):** `reply.redirect(url, statusCode)` — e.g. `reply.redirect('/path', 302)`

Passing a number as the first argument in v5 sets `Location: "302"` (treating the number as the URL string) and returns a 500. Always use `reply.redirect(url[, code])`.

### Guest session cookie in local dev
The `guest_session` cookie uses `Secure: process.env.NODE_ENV === 'production'`. In local dev over plain HTTP the `Secure` flag is omitted so browsers accept the cookie. In production (HTTPS) `Secure` is set automatically.

## Local Runner — Missing Runtimes

PHP, Lua, Groovy, C# (.NET), and Assembly (NASM) are not installed by default on macOS.
When a run is attempted and the binary is absent, the executor emits a descriptive `[CodeRelay]` message in the Build Output panel rather than a cryptic ENOENT error.

| Language | Binary checked | Install (macOS) | Install (Linux) |
|---|---|---|---|
| PHP | `php` | `brew install php` | `apt-get install php` |
| Lua | `lua` / `lua5.4` | `brew install lua` | `apt-get install lua5.4` |
| Groovy | `groovy` | `brew install groovy` | `sdk install groovy` |
| C# | `dotnet` | [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) | same |
| Assembly | `nasm` | `brew install nasm` | `apt-get install nasm` |

All five are present in the Kubernetes runner images used in production, so these errors only occur in local dev.

After installing, restart the executor (`pnpm --filter @coderelay/executor dev`) to pick up the change.
