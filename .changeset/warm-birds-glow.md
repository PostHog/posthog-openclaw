---
'@posthog/openclaw': patch
---

Fix memory leak in cleanupStaleRuns where traces, generationSpans, and traceTokens maps were never evicted for stale sessions
