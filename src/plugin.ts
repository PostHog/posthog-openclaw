import type { DiagnosticMessageProcessedEvent, OpenClawPluginApi } from './openclaw-types.js'
import { onDiagnosticEvent } from 'openclaw/plugin-sdk'
import { buildAiGeneration, buildAiSpan, buildAiTrace } from './events.js'
import type { PostHogPluginConfig, RunState } from './types.js'
import { generateSpanId, generateTraceId, parseLastAssistant } from './utils.js'

const STALE_RUN_MS = 5 * 60 * 1000

/**
 * Process-wide registry so we install a single `beforeExit` listener regardless
 * of how many plugin instances are constructed in this process. Tests construct
 * many instances; production hosts construct one.
 */
const activeClientsForFlush = new Set<import('posthog-node').PostHog>()
let processExitHandlerInstalled = false

function ensureProcessExitHandler() {
    if (processExitHandlerInstalled) return
    processExitHandlerInstalled = true
    process.once('beforeExit', () => {
        const pending: Promise<unknown>[] = []
        for (const c of activeClientsForFlush) {
            pending.push(c.shutdown().catch(() => {}))
        }
        // Best-effort: Node doesn't actually wait for this beyond the next tick,
        // but posthog-node's shutdown synchronously schedules its final flush.
        void Promise.allSettled(pending)
    })
}

export function registerPostHogHooks(api: OpenClawPluginApi, config: PostHogPluginConfig) {
    /** In-flight LLM runs keyed by runId */
    const runs = new Map<string, RunState>()
    /** Active trace IDs keyed by sessionKey */
    const traces = new Map<string, string>()
    /** Most recent generation spanId keyed by sessionKey, used as parent for tool spans */
    const generationSpans = new Map<string, string>()
    /** Last runId seen per sessionKey — a new runId means a new message cycle */
    const lastRunId = new Map<string, string>()
    /** Timestamp of last llm_output per sessionKey — used for session window timeout */
    const lastOutputAt = new Map<string, number>()
    /** Accumulated token totals per traceId for $ai_trace */
    const traceTokens = new Map<string, { input: number; output: number }>()
    /** Session window IDs keyed by sessionKey — windowed $ai_session_id */
    const sessionWindows = new Map<string, { sessionId: string; lastOutputAt: number }>()
    /** Most recent sessionKey from llm_output — fallback for after_tool_call when ctx.sessionKey is missing */
    let lastActiveSessionKey: string | undefined

    let client: import('posthog-node').PostHog | null = null
    let clientInitPromise: Promise<import('posthog-node').PostHog> | null = null
    let unsubscribe: (() => void) | null = null

    /**
     * Lazily construct the PostHog client and subscribe to diagnostic events.
     *
     * The gateway service path calls this from `registerService.start()` for
     * long-running processes, but short-lived CLI invocations (e.g. `openclaw
     * agent ...`) load the plugin in a fresh Node process that never reaches
     * `start()` — they fire lifecycle hooks then exit. Hooks therefore call
     * `ensureClient()` themselves so capture works in both contexts.
     */
    async function ensureClient(): Promise<import('posthog-node').PostHog> {
        if (client) return client
        if (clientInitPromise) return clientInitPromise
        clientInitPromise = (async () => {
            const { PostHog: PostHogClient } = await import('posthog-node')
            const instance = new PostHogClient(config.apiKey, {
                host: config.host,
                flushAt: 20,
                flushInterval: 10_000,
            })
            client = instance

            // Subscribe to diagnostic events for $ai_trace capture
            unsubscribe = onDiagnosticEvent((raw) => {
                if (!client) return
                if (raw.type !== 'message.processed') return

                const evt = raw as unknown as DiagnosticMessageProcessedEvent
                const sessionKey = evt.sessionKey
                const traceId = sessionKey ? traces.get(sessionKey) : undefined
                if (!traceId) return

                const tokenTotals = traceTokens.get(traceId)
                const sessionId = sessionKey ? sessionWindows.get(sessionKey)?.sessionId : undefined
                const traceEvent = buildAiTrace(traceId, evt, tokenTotals, sessionId)
                client.capture({
                    distinctId: traceEvent.distinctId,
                    event: traceEvent.event,
                    properties: traceEvent.properties,
                })
                // In message mode, clean up trace state after completion.
                // In session mode, keep the trace alive for reuse across messages.
                if (sessionKey && config.traceGrouping !== 'session') {
                    traces.delete(sessionKey)
                    generationSpans.delete(sessionKey)
                    traceTokens.delete(traceId)
                }
            })

            // Flush pending events when a short-lived CLI process exits.
            activeClientsForFlush.add(instance)
            ensureProcessExitHandler()

            return instance
        })()
        return clientInitPromise
    }

    function getOrCreateSessionId(sessionKey: string): string {
        const existing = sessionWindows.get(sessionKey)
        const timeoutMs = config.sessionWindowMinutes * 60_000

        if (existing && Date.now() - existing.lastOutputAt < timeoutMs) {
            return existing.sessionId
        }

        // New window — generate windowed session ID
        const windowId = generateSpanId().slice(0, 8)
        const sessionId = `${sessionKey}:${windowId}`
        sessionWindows.set(sessionKey, { sessionId, lastOutputAt: Date.now() })
        return sessionId
    }

    function getOrCreateTraceId(sessionKey: string | undefined, runId: string): string {
        if (!sessionKey) {
            return generateTraceId()
        }

        if (config.traceGrouping === 'session') {
            const existing = traces.get(sessionKey)
            const lastOutput = lastOutputAt.get(sessionKey)
            const timeoutMs = config.sessionWindowMinutes * 60_000

            // Reuse trace if it exists and hasn't timed out
            if (existing && lastOutput && Date.now() - lastOutput < timeoutMs) {
                return existing
            }

            // Clean up stale token totals from the rotated trace
            if (existing) {
                traceTokens.delete(existing)
            }

            // Otherwise start a new trace
            const traceId = generateTraceId()
            traces.set(sessionKey, traceId)
            return traceId
        }

        // "message" mode (default) — split on runId change
        const prevRunId = lastRunId.get(sessionKey)
        const existing = traces.get(sessionKey)
        if (existing && prevRunId === runId) {
            return existing
        }

        lastRunId.set(sessionKey, runId)
        const traceId = generateTraceId()
        traces.set(sessionKey, traceId)
        return traceId
    }

    function cleanupStaleRuns() {
        const now = Date.now()
        for (const [runId, state] of runs) {
            if (now - state.startTime > STALE_RUN_MS) {
                runs.delete(runId)
            }
        }
        // Evict stale session-keyed entries to prevent unbounded growth
        for (const [key, ts] of lastOutputAt) {
            if (now - ts > STALE_RUN_MS) {
                lastOutputAt.delete(key)
                lastRunId.delete(key)
                const traceId = traces.get(key)
                if (traceId) {
                    traceTokens.delete(traceId)
                    traces.delete(key)
                }
                generationSpans.delete(key)
                // Only evict sessionWindows if also past the session window timeout
                const window = sessionWindows.get(key)
                if (window && now - window.lastOutputAt > config.sessionWindowMinutes * 60_000) {
                    sessionWindows.delete(key)
                }
            }
        }
    }

    // Register the background service that manages the PostHog client lifecycle
    // in the long-running gateway process. CLI agent invocations skip this
    // path; they rely on `ensureClient()` being called from inside each hook.
    api.registerService({
        id: 'posthog',
        async start() {
            await ensureClient()
        },
        async stop() {
            unsubscribe?.()
            unsubscribe = null
            if (client) {
                activeClientsForFlush.delete(client)
                await client.shutdown()
                client = null
            }
            clientInitPromise = null
            runs.clear()
            traces.clear()
            generationSpans.clear()
            lastRunId.clear()
            lastOutputAt.clear()
            traceTokens.clear()
            sessionWindows.clear()
            lastActiveSessionKey = undefined
        },
    })

    // -- Lifecycle Hooks --

    api.on('llm_input', async (event, ctx) => {
        // Initialize the client up front so subsequent llm_output / after_tool_call
        // hooks in the same agent run can capture without racing init.
        await ensureClient()
        cleanupStaleRuns()

        const traceId = getOrCreateTraceId(ctx.sessionKey, event.runId)
        const spanId = generateSpanId()
        const sessionId = ctx.sessionKey ? getOrCreateSessionId(ctx.sessionKey) : undefined

        // Build the input message array: system prompt + history + current prompt
        let input: unknown[] | null = null
        if (!config.privacyMode) {
            input = []
            if (event.systemPrompt) {
                input.push({ role: 'system', content: event.systemPrompt })
            }
            input.push(...event.historyMessages, event.prompt)
        }

        // Set generation span and active session early so after_tool_call can
        // find them — tool hooks fire during the LLM call, before llm_output.
        if (ctx.sessionKey) {
            generationSpans.set(ctx.sessionKey, spanId)
            lastActiveSessionKey = ctx.sessionKey
        }

        runs.set(event.runId, {
            traceId,
            spanId,
            startTime: Date.now(),
            model: event.model,
            provider: event.provider,
            input,
            sessionKey: ctx.sessionKey,
            sessionId,
            channel: ctx.messageProvider,
            agentId: ctx.agentId,
        })
    })

    api.on('llm_output', async (event, ctx) => {
        const c = await ensureClient()
        if (!c) return

        const runState = runs.get(event.runId)
        if (!runState) return
        runs.delete(event.runId)

        // Track the generation spanId for tool call parenting.
        const sessionKey = ctx.sessionKey
        if (sessionKey) {
            generationSpans.set(sessionKey, runState.spanId)
            lastActiveSessionKey = sessionKey
            // Track lastOutputAt in both modes for session windowing and trace timeout
            const now = Date.now()
            lastOutputAt.set(sessionKey, now)
            const window = sessionWindows.get(sessionKey)
            if (window) {
                window.lastOutputAt = now
            }
        }

        const lastAssistant = parseLastAssistant(event.lastAssistant)

        // Accumulate token totals for the trace
        const inputTokens = event.usage?.input ?? 0
        const outputTokens = event.usage?.output ?? 0
        if (inputTokens > 0 || outputTokens > 0) {
            const existing = traceTokens.get(runState.traceId)
            if (existing) {
                existing.input += inputTokens
                existing.output += outputTokens
            } else {
                traceTokens.set(runState.traceId, { input: inputTokens, output: outputTokens })
            }
        }

        const generation = buildAiGeneration(runState, event, config.privacyMode, lastAssistant)
        c.capture({
            distinctId: generation.distinctId,
            event: generation.event,
            properties: generation.properties,
        })
    })

    api.on('after_tool_call', async (event, ctx) => {
        const c = await ensureClient()
        if (!c) return

        // Upstream after_tool_call emitters may not include sessionKey in context.
        // Fall back to the most recent sessionKey from llm_output, which is reliable
        // because tool calls execute synchronously within the same agent invocation.
        const sessionKey = ctx.sessionKey || lastActiveSessionKey

        const traceId = sessionKey ? traces.get(sessionKey) : undefined
        if (!traceId) return

        const parentSpanId = sessionKey ? generationSpans.get(sessionKey) : undefined
        const sessionId = sessionKey ? sessionWindows.get(sessionKey)?.sessionId : undefined

        const span = buildAiSpan(traceId, parentSpanId, event, ctx, config.privacyMode, sessionId)
        c.capture({
            distinctId: span.distinctId,
            event: span.event,
            properties: span.properties,
        })
    })
}
