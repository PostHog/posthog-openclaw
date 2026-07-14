---
'@posthog/openclaw': patch
---

Fall back to the `POSTHOG_HOST` environment variable when `host` is not set in the plugin config, so self-hosted and EU-hosted users can configure the instance URL via the environment. Surrounding whitespace in a configured `host` (or `POSTHOG_HOST`) is trimmed.
