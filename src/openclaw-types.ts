/**
 * Inlined types from openclaw/plugin-sdk.
 *
 * These are copied from the upstream OpenClaw codebase to avoid requiring
 * openclaw as a build-time dependency. Only the subset used by this plugin
 * is included. When openclaw/plugin-sdk exports stabilize, this file can
 * be replaced with direct imports.
 */

// -- Plugin API --

export type PluginLogger = {
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
    debug: (...args: unknown[]) => void
}

export type OpenClawPluginService = {
    id: string
    start: () => Promise<void>
    stop?: () => Promise<void>
}

export type OpenClawPluginApi = {
    pluginConfig?: Record<string, unknown>
    logger: PluginLogger
    registerService: (service: OpenClawPluginService) => void
    on(
        hookName: 'llm_input',
        handler: (event: PluginHookLlmInputEvent, ctx: PluginHookAgentContext) => void | Promise<void>,
        opts?: { priority?: number }
    ): void
    on(
        hookName: 'llm_output',
        handler: (event: PluginHookLlmOutputEvent, ctx: PluginHookAgentContext) => void | Promise<void>,
        opts?: { priority?: number }
    ): void
    on(
        hookName: 'after_tool_call',
        handler: (event: PluginHookAfterToolCallEvent, ctx: PluginHookToolContext) => void | Promise<void>,
        opts?: { priority?: number }
    ): void
    on(
        hookName: string,
        handler: (event: unknown, ctx: unknown) => void | Promise<void>,
        opts?: { priority?: number }
    ): void
    [key: string]: unknown
}

// -- Hook Event Types --

export type PluginHookAgentContext = {
    agentId?: string
    sessionKey?: string
    sessionId?: string
    workspaceDir?: string
    messageProvider?: string
}

export type PluginHookLlmInputEvent = {
    runId: string
    sessionId: string
    provider: string
    model: string
    systemPrompt?: string
    prompt: string
    historyMessages: unknown[]
    imagesCount: number
}

export type PluginHookLlmOutputEvent = {
    runId: string
    sessionId: string
    provider: string
    model: string
    assistantTexts: string[]
    lastAssistant?: unknown
    usage?: {
        input?: number
        output?: number
        cacheRead?: number
        cacheWrite?: number
        total?: number
    }
}

export type PluginHookToolContext = {
    agentId?: string
    sessionKey?: string
    toolName: string
}

export type PluginHookAfterToolCallEvent = {
    toolName: string
    params: Record<string, unknown>
    result?: unknown
    error?: string
    durationMs?: number
}

// -- Diagnostic Events --

export type DiagnosticMessageProcessedEvent = {
    type: 'message.processed'
    ts: number
    seq: number
    channel: string
    messageId?: number | string
    chatId?: number | string
    sessionKey?: string
    sessionId?: string
    durationMs?: number
    outcome: 'completed' | 'skipped' | 'error'
    reason?: string
    error?: string
}

export type DiagnosticEventPayload =
    | DiagnosticMessageProcessedEvent
    | { type: string; ts: number; seq: number; [key: string]: unknown }
