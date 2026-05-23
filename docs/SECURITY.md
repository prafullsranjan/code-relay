# Security Boundaries

## Invite Safety
- Invite URLs carry raw secret token, but DB stores only hash(secret+pepper).
- Redemption uses atomic conditional update against PENDING + tokenHash + not expired.
- Concurrent redemption race: only one update succeeds, others fail.
- On success, token is replaced with guest_session cookie and redirect drops token from URL.
- Invite redeem route sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

## Guest Session Cookie
- `guest_session` cookie is `HttpOnly` (no JS access) and `SameSite=Lax`.
- `Secure` flag is set only in production (`NODE_ENV=production`). In local dev over HTTP, `Secure` is omitted so the cookie is accepted.
- `SameSite=Lax` (not `Strict`) is required because the initial invite redemption is a cross-site navigation from wherever the invite link was shared.
- Cookie max-age is 7 days.

## Workspace Isolation
- Personal - Open Sharing (LOCAL) allows guest_session access for collab and run (capability-gated).
- Team - organization only (GHE_BOUND) rejects guest invites and guest websocket access.

## Execution Isolation
- Runner Jobs enforce runtimeClassName (kata-fc default).
- Strict container security context: non-root, no privilege escalation, drop ALL capabilities, read-only root fs.
- NetworkPolicy denies egress by default for runner pods except DNS.

## Local Executor — Pre-flight Checks

Before spawning a language runtime the executor calls `findBinary()` to confirm the binary exists in PATH. If it does not, execution is aborted immediately with a user-readable `[CodeRelay]`-prefixed error message that includes install instructions. This prevents leaking internal path information through raw `ENOENT` errors and avoids spawning a shell that would then fail with an opaque message.

Languages with optional runtimes (PHP, Lua, Groovy, C#, NASM) receive this check. Languages guaranteed to be present on any runner (Python, Node, Java, GCC, Ruby) do not require it.

## stderr Sanitisation

Ruby on macOS emits `Insecure world writable dir ... in PATH` lines from `rbconfig.rb` on every invocation. These lines are filtered in the executor before forwarding to the client so they are never surfaced as execution errors. The filter is applied via a per-language `stderrFilter` callback rather than a global pattern to minimise the risk of silently suppressing legitimate stderr output from other runtimes.
