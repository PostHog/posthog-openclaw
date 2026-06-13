import type { OpenClawPluginApi } from './src/openclaw-types.js'
import { registerPostHogHooks } from './src/plugin.js'
import type { PostHogPluginConfig } from './src/types.js'

const DEFAULT_HOST = 'https://us.i.posthog.com'

function normalizeApiKey(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

const plugin = {
    id: 'posthog',
    name: 'PostHog LLM Analytics',
    description: 'Send LLM traces, generations, and tool spans to PostHog',
    register(api: OpenClawPluginApi) {
        const raw = api.pluginConfig ?? {}

        const traceGrouping = raw.traceGrouping === 'session' ? 'session' : 'message'
        const sessionWindowMinutes =
            typeof raw.sessionWindowMinutes === 'number' && raw.sessionWindowMinutes > 0 ? raw.sessionWindowMinutes : 60

        const config: PostHogPluginConfig = {
            apiKey: normalizeApiKey(raw.apiKey) ?? normalizeApiKey(process.env.POSTHOG_API_KEY) ?? '',
            host: typeof raw.host === 'string' ? raw.host : DEFAULT_HOST,
            privacyMode: raw.privacyMode === true,
            enabled: raw.enabled !== false,
            traceGrouping,
            sessionWindowMinutes,
        }

        if (!config.enabled) {
            api.logger.info('posthog: plugin disabled')
            return
        }

        if (!config.apiKey) {
            api.logger.warn('posthog: missing apiKey — set config.apiKey or POSTHOG_API_KEY env var')
            return
        }

        registerPostHogHooks(api, config)
    },
}

export default plugin
