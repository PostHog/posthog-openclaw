# @posthog/openclaw

## 0.2.3

### Patch Changes

- 21356df: Ship compiled JavaScript runtime output and OpenClaw runtime metadata in the published npm package.

## 0.2.2

### Patch Changes

- fa25083: Fix LLM event capture in short-lived CLI agent runs.

    The PostHog client was only constructed inside `api.registerService({ start() })`, which only runs in the long-running OpenClaw gateway process. CLI invocations such as `openclaw agent --agent main -m "..."` load the plugin in a fresh Node process that fires `llm_input` / `llm_output` / `after_tool_call` hooks and then exits — `start()` never runs there, so `client` stayed `null` and every capture silently short-circuited.

    The fix:
    - Lazily construct the PostHog client via a new `ensureClient()` helper. The gateway path still calls it from `registerService.start()`; CLI runs call it from inside each hook before capturing.
    - Move the `onDiagnosticEvent` subscription into `ensureClient()` so trace capture works in both contexts.
    - Install a single shared `process.once('beforeExit', ...)` listener (tracked via a module-level registry of active clients) that flushes pending events before short-lived CLI processes exit, without leaking listeners across plugin instances or tests.

    Verified end-to-end against `https://us.posthog.com`: `openclaw agent` runs now produce `$ai_generation` events with the full `$ai_*` property set (model, provider, trace id, input/output tokens, latency, cost, etc.).

    Note for users with non-bundled installs: because `llm_input` / `llm_output` are conversation hooks, OpenClaw's loader also requires `plugins.entries.posthog.hooks.allowConversationAccess: true` in `~/.openclaw/openclaw.json` for the hooks to register. The README should document this.

## 0.2.1

### Patch Changes

- 2a0a145: Fix memory leak in cleanupStaleRuns where traces, generationSpans, and traceTokens maps were never evicted for stale sessions

## 0.2.0

### Minor Changes

- 8573663: Add $ai_lib_version property to all AI events

## 0.1.0

### Minor Changes

- 40d2c18: Release 0.1.0 with openclaw.extensions field and plugin manifest for proper plugin installation via `openclaw plugins install @posthog/openclaw`
