# @posthog/openclaw

## 0.2.1

### Patch Changes

- 2a0a145: Fix memory leak in cleanupStaleRuns where traces, generationSpans, and traceTokens maps were never evicted for stale sessions

## 0.2.0

### Minor Changes

- 8573663: Add $ai_lib_version property to all AI events

## 0.1.0

### Minor Changes

- 40d2c18: Release 0.1.0 with openclaw.extensions field and plugin manifest for proper plugin installation via `openclaw plugins install @posthog/openclaw`
