# Copilot Agent Instructions – Premium Control, Caching & Metrics

Purpose:
Define how Copilot agents behave when advanced reasoning or orchestration
is considered, with the goal of minimizing premium request usage while
preserving correctness and developer intent.

These rules apply ONLY when agent-level reasoning is involved.
They complement (and do not override) CLAUDE.md.

==================================================
## AGENT ENTRY CONDITIONS

Agents should be considered ONLY when:
- The task cannot be solved deterministically
- Cross-file or cross-module reasoning is required
- Architectural or system-level understanding is necessary

Agents must NOT be used for:
- Single-file edits
- Simple refactors
- Bug fixes
- Deterministic code generation
- Style or formatting changes

==================================================
## REQUEST CLASSIFICATION (MANDATORY)

Before invoking any agent behavior, classify the request:

### SIMPLE
- Single file
- Locally refactor
- Bug fix
- Code explanation
- Deterministic generation

### COMPLEX
- Architecture design
- Multi-module reasoning
- Repo-wide analysis
- End-to-end flows

SIMPLE requests must NEVER escalate to premium agent workflows.

==================================================
## PREMIUM ESCALATION POLICY

Default behavior:
- Avoid premium agent escalation
- Prefer local reasoning and existing context
- Reuse prior decisions and plans
Explicit premium opt-in:
- Premium agent reasoning is allowed ONLY when the user includes:
  `~deep`

If `~deep` is NOT present:
- Do NOT escalate to premium
- Do NOT re-analyze the repository
- Do NOT trigger multistep orchestration

==================================================
## ARCHITECTURE CACHE (STATEFUL BEHAVIOR)

When a COMPLEX request results in an architecture, design, or plan:

- Treat the generated plan as authoritative
- Cache it implicitly for the session/workspace
- Reuse it for all follow-up requests
- Do NOT regenerate or re-analyze unless:
    - The user explicitly requests changes, or
    - The user includes `~deep`

For this repository, cache and reuse agreed flow decisions (for example which listeners own OCM/ICUE/task/staff processing and where retries are applied).

This cache exists to prevent repeated premium usage.

==================================================
## AGENT EXECUTION RULES

When an agent is legitimately invoked:
- Prefer minimal reasoning depth
- Prefer fewer steps over exhaustive exploration
- Avoid speculative alternatives unless requested
- Stop once sufficient correctness is achieved

Agents must never:
- Over-optimize for completeness at the cost of escalation
- Re-run analysis unnecessarily
- Generate redundant reasoning

==================================================
## METRICS LOGGING (NON-USER-VISIBLE)

Silently record the following for optimization purposes:

- Request classification (SIMPLE / COMPLEX)
- Whether agent escalation occurred
- Whether escalation was user-authorized (`~deep`)
- Architecture cache hit vs re-analysis
- Reason for escalation (if any)

Metrics must:
- Never be exposed to the user
- Never affect the response content
- Never change workflow behavior

==================================================
## FAILURE & SAFETY RULES

If agent reasoning risks:
- Incorrect conclusions
- Hallucinated APIs or behaviors
- Overconfidence without evidence

Then:
- Reduce scope
- Fall back to safer local reasoning
- Ask for clarification ONLY if required for correctness
- Verify concrete behavior from code/config instead of assumptions 

==================================================
## NON-GOALS

This file must NOT:
- Control verbosity
- Enforce formatting or style
- Alter code generation quality
- Override explicit user instructions
- Introduce friction or confirmations

==================================================
## SUMMARY (MENTAL MODEL)

- SIMPLE → no agent, no premium
- COMPLEX → agent allowed, but premium ONLY with `~deep`
- Plans are cached and reused
- Premium is used deliberately, not accidentally