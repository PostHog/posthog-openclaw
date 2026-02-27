/**
 * Ambient module declaration for openclaw/plugin-sdk.
 *
 * At runtime, Jiti (OpenClaw's plugin loader) resolves this module.
 * We only need the onDiagnosticEvent function signature for type-checking.
 */
declare module 'openclaw/plugin-sdk' {
    export function onDiagnosticEvent(handler: (event: { type: string; [key: string]: unknown }) => void): () => void
}
