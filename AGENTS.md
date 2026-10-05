# AGENTS.md

This OpenClaw plugin (`@posthog/openclaw`) sends LLM activity to PostHog as `$ai_*` events. See [README.md](README.md) for configuration and local testing; [package.json](package.json), [.oxfmtrc.json](.oxfmtrc.json), and [tsconfig.json](tsconfig.json) own commands and tooling settings.

## Runtime safeguards

- Plugin/config identity is `posthog`, not the npm package name: keep [index.ts](index.ts), [openclaw.plugin.json](openclaw.plugin.json), and the `openclaw.json` config entry aligned.
- Preserve both loading paths in `package.json`: `openclaw.extensions` uses `./index.ts` for source/Jiti loading; `openclaw.runtimeExtensions` and `main` use `./dist/index.js`, with declarations at `./dist/index.d.ts`.
- Host types are inlined in [src/openclaw-types.ts](src/openclaw-types.ts) to avoid a build-time OpenClaw dependency. [src/openclaw-plugin-sdk.d.ts](src/openclaw-plugin-sdk.d.ts) types the runtime `onDiagnosticEvent` import from `openclaw/plugin-sdk`; retain host resolution.
- Preserve privacy-mode redaction of prompts/messages and tool inputs/results in [src/events.ts](src/events.ts) and [src/utils.ts](src/utils.ts), while retaining usage/latency/model/error metadata.
- In [src/plugin.ts](src/plugin.ts), correlate input/output by `runId`; keep unique generation/tool span IDs and tool parenting, including tools firing before output. Preserve windowed session IDs, inactivity rotation, default message traces per run versus session-window grouping, and stale-state cleanup.
- Preserve gateway service start/stop and hook-driven initialization for short-lived CLI processes that skip service start. Keep shared initialization, best-effort exit flushing, shutdown/unsubscription, and state cleanup.

## Validation

Run relevant checks from the repository root; scripts are defined in `package.json`.

```bash
pnpm vitest run src/events.test.ts  # Focused example
pnpm test                          # Full Vitest suite
pnpm typecheck
pnpm lint
pnpm format                        # Check only
pnpm build                         # JavaScript and declarations in dist/
pnpm pack:verify                   # Build and verify packed runtime output
```

Require `pnpm pack:verify` for build, entrypoint, or package changes. Markdown-only edits need path/link and diff checks, not SDK builds.

## Reviews and releases

When reviewing or fixing someone else's PR, do not ask for or open an issue. Note an external contributor's public API change when it has neither an agreed issue nor an API-defining published spec.

Add a Changeset (`pnpm changeset`) for releasable changes. Releases with pending changesets require maintainer approval through the protected GitHub `Release` environment; no release label is required. See [RELEASING.md](RELEASING.md) for mechanics.
