# CodeRelay Architecture

## Components
- web (Next.js + Monaco)
- api (Fastify + Prisma + BullMQ)
- collab (Hocuspocus/Yjs + run event websocket fan-out)
- executor (BullMQ worker + Kubernetes Job orchestration)
- Postgres, Redis

## Workspace Modes
- Personal - open Sharing (LOCAL): owner + guest (invite-based) can access collab and run APIs.
- Team - organization only (GHE_BOUND): owner login required; guest invite creation blocked; guest websocket access blocked.

## Supported Languages

Fifteen languages are supported. Three are browser-only (no executor):

| Category | Languages |
|---|---|
| Browser-only | HTML (iframe preview), JSON (validate/format/minify), XML (validate/format/minify) |
| Interpreted | Python, JavaScript, Node.js, PHP, Lua, Groovy, Ruby |
| Compiled | Java, C, C++, C#, Assembly |

`NON_EXECUTABLE_LANGS` in `apps/executor/src/k8s.ts` contains `html`, `json`, and `xml`.
The web UI omits the Run button for these three languages and shows Minify only for JSON/XML.

## Data Flows
1. Owner creates workspace.
2. Owner creates invite (LOCAL only): server stores hash(secret) only.
3. Guest redeems single-use invite atomically and receives guest_session cookie.
4. Editor sync via Yjs websocket document room.
5. Run request creates run row and queue job.
6. Executor creates Kubernetes Job (runtimeClassName set to kata-fc by default), emits run events.
7. run_events are persisted and published via Redis; collab server broadcasts and replays.

## Code Execution — Local Runner

When Kubernetes is not available (local development) the executor spawns processes directly.

### Pre-flight binary checks
Before spawning, the executor calls `findBinary()` for runtimes that are not universally installed (PHP, Lua, Groovy, dotnet, nasm). If the binary is absent the job fails immediately with a `[CodeRelay]`-prefixed message that includes install instructions. This avoids misleading ENOENT errors.

### Compile timeout
Compile steps use a 30 s timeout (`COMPILE_TIMEOUT_MS = 30_000`).

### stderr filtering
Ruby on macOS emits an `Insecure world writable dir` warning through rbconfig.rb. The executor filters these lines before forwarding them to the client so they do not appear as errors.

## Invite Redemption Flow

```
Browser → GET /i/:inviteId?t=<token>
  Next.js route handler (apps/web/app/i/[id]/route.ts)
    → POST http://localhost:3001/api/invites/:inviteId/redeem?t=<token>
      Fastify validates token hash, updates invite to USED (atomic)
      Sets guest_session cookie
      Returns 302 → /w/:workspaceId    ← Fastify v5: reply.redirect(url, code)
    ← 302 + set-cookie forwarded by Next.js route handler
  Browser lands on /w/:workspaceId with guest_session cookie set
```

**Important**: Fastify v5 changed `reply.redirect` signature to `(url, statusCode)`.
Passing `(statusCode, url)` (old v3 style) sets `Location: "302"` and returns 500.

## Web Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | Page | Home — workspace creation, guest session, language grid |
| `/w/[id]` | Page | Workspace editor |
| `/i/[id]` | Route handler | Redeem guest invite, set cookie, redirect to workspace |
| `/docs` | Page | Documentation |
| `/privacy` | Page | Privacy policy |
| `/contact` | Page | Team and project info |
| `/github` | Route handler | 302 redirect → https://github.com/pranja33_uhg |

## Workspace Editor — Key Behaviours

- **Per-language code cache** — switching language saves the current editor content in memory; switching back restores it. Starter code is used only for the first visit.
- **Build output cleared on language switch** — `setEvents([])` is called in `handleLangChange` so stale output from a previous language is never shown.
- **Beautify (`model.pushEditOperations`)** — for all languages except HTML, beautification is applied directly to the Monaco model rather than via `editor.action.formatDocument`, which is unreliable for custom providers. The edit is undoable and propagates to all collaborators via the Y.Doc binding.
- **Minify** — available for JSON and XML only; rendered as an icon-only `file-tab-action` button matching the other toolbar icons.
- **Theme transitions** — CSS `transition: background-color 0.25s, color 0.25s` on key elements produces a smooth light/dark mode switch.
