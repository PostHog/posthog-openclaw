# AGENTS.md

This file provides guidance to AI coding agents working with this repository.
See [agents.md](https://agents.md/) for the spec.

## Commands

```bash
pnpm install          # Install dependencies
pnpm test             # Run all tests (vitest)
pnpm typecheck        # TypeScript check (tsc --noEmit)
pnpm lint             # Prettier check
pnpm lint:fix         # Prettier auto-fix
```

Run a single test file: `pnpm vitest run src/events.test.ts`

## Architecture

This is an OpenClaw plugin (`@posthog/openclaw`) that captures LLM activity and sends structured `$ai_*` events to PostHog.

### Entry Point & Plugin Lifecycle

`index.ts` exports the plugin object with `id: "posthog"` and a `register(api)` method. OpenClaw's Jiti-based plugin loader calls `register()` at startup, passing the `OpenClawPluginApi` which provides hooks, config, logging, and service registration.

### Core Flow

1. **`plugin.ts`** — `registerPostHogHooks()` wires three OpenClaw hooks and one diagnostic event listener:
   - `llm_input`: Records run state (model, provider, messages, spanId) in an in-memory `Map<runId, RunState>`. Creates/reuses trace and session IDs.
   - `llm_output`: Correlates with `llm_input` by `runId`, calls `buildAiGeneration()`, captures `$ai_generation` via PostHog client.
   - `after_tool_call`: Calls `buildAiSpan()`, captures `$ai_span` parented to the generation span.
   - `message.processed` (diagnostic): Calls `buildAiTrace()`, captures `$ai_trace` for the completed message cycle.

2. **`events.ts`** — Pure builder functions (`buildAiGeneration`, `buildAiSpan`, `buildAiTrace`) that construct PostHog event payloads. No side effects; easy to unit test.

3. **`utils.ts`** — Message format conversion (Anthropic → OpenAI chat format), privacy redaction, ID generation.

4. **`types.ts`** — `PostHogPluginConfig`, `RunState`, `LastAssistantInfo`.

### Type Strategy

Types from `openclaw/plugin-sdk` are **inlined** in `src/openclaw-types.ts` to avoid a build-time dependency on openclaw. An ambient module declaration (`src/openclaw-plugin-sdk.d.ts`) provides type info for the runtime `onDiagnosticEvent` import that Jiti resolves at runtime.

### Trace/Session Model

- **Session ID**: Windowed — `"{sessionKey}:{windowId}"`, rotates after `sessionWindowMinutes` of inactivity.
- **Trace ID**: In `"message"` mode (default), one trace per `runId`. In `"session"` mode, one trace per session window.
- **Span ID**: Unique per generation or tool call within a trace.
- Stale runs are cleaned up after 5 minutes.

### Plugin Identity

The plugin ID is `"posthog"` (from `openclaw.plugin.json`), not the npm package name. The config entry key in `openclaw.json` must be `"posthog"`.

## Code Style

- Prettier: 4-space indent, single quotes, no semicolons, 120 char width (matches posthog-js conventions)
- TypeScript: ES2022 target, Node16 module resolution, strict mode, `verbatimModuleSyntax`
- No build step — TypeScript source is loaded directly by OpenClaw's Jiti runtime

## Release Process

Uses changesets. To release:
1. Add a changeset: `pnpm changeset`
2. Create a PR with the `release` label
3. Merge → CI runs `changeset version` → publishes to npm via OIDC provenance → creates git tag and GitHub Release
