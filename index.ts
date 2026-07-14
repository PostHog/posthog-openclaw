import type { OpenClawPluginApi } from './src/openclaw-types.js'
import { registerPostHogHooks } from './src/plugin.js'
import type { PostHogPluginConfig } from './src/types.js'

const DEFAULT_HOST = 'https://us.i.posthog.com'

function normalizeString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
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
            apiKey: normalizeString(raw.apiKey) ?? normalizeString(process.env.POSTHOG_API_KEY) ?? '',
            host: normalizeString(raw.host) ?? normalizeString(process.env.POSTHOG_HOST) ?? DEFAULT_HOST,
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
