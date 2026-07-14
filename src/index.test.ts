import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { OpenClawPluginApi } from './openclaw-types.js'

const registerPostHogHooksMock = vi.hoisted(() => vi.fn())

vi.mock('./plugin.js', () => ({
    registerPostHogHooks: registerPostHogHooksMock,
}))

import plugin from '../index.js'

function createMockApi(pluginConfig?: Record<string, unknown>) {
    return {
        pluginConfig,
        logger: {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
        },
        registerService: vi.fn(),
        on: vi.fn(),
    } as unknown as OpenClawPluginApi
}

describe('posthog plugin register', () => {
    const originalApiKey = process.env.POSTHOG_API_KEY

    beforeEach(() => {
        registerPostHogHooksMock.mockReset()
        delete process.env.POSTHOG_API_KEY
    })

    afterEach(() => {
        if (originalApiKey === undefined) {
            delete process.env.POSTHOG_API_KEY
        } else {
            process.env.POSTHOG_API_KEY = originalApiKey
        }
    })

    test.each([
        ['missing', {}],
        ['empty', { apiKey: '' }],
        ['whitespace', { apiKey: '   ' }],
    ])('uses POSTHOG_API_KEY env fallback when config apiKey is %s', (_case, pluginConfig) => {
        process.env.POSTHOG_API_KEY = 'phc_env'
        const api = createMockApi(pluginConfig)

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                apiKey: 'phc_env',
                host: 'https://us.i.posthog.com',
                enabled: true,
                privacyMode: false,
                traceGrouping: 'message',
                sessionWindowMinutes: 60,
            })
        )
        expect(api.logger.warn).not.toHaveBeenCalled()
    })

    test('prefers a nonblank configured apiKey over POSTHOG_API_KEY', () => {
        process.env.POSTHOG_API_KEY = 'phc_env'
        const api = createMockApi({ apiKey: 'phc_config' })

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                apiKey: 'phc_config',
            })
        )
    })

    test('warns and skips hook registration when no apiKey is configured', () => {
        const api = createMockApi({ apiKey: '   ' })

        plugin.register(api)

        expect(registerPostHogHooksMock).not.toHaveBeenCalled()
        expect(api.logger.warn).toHaveBeenCalledWith(
            'posthog: missing apiKey — set config.apiKey or POSTHOG_API_KEY env var'
        )
    })
})

describe('posthog plugin host resolution', () => {
    const originalHost = process.env.POSTHOG_HOST

    beforeEach(() => {
        registerPostHogHooksMock.mockReset()
        delete process.env.POSTHOG_HOST
    })

    afterEach(() => {
        if (originalHost === undefined) {
            delete process.env.POSTHOG_HOST
        } else {
            process.env.POSTHOG_HOST = originalHost
        }
    })

    test.each([
        ['missing', { apiKey: 'phc_test' }],
        ['empty', { apiKey: 'phc_test', host: '' }],
        ['whitespace', { apiKey: 'phc_test', host: '   ' }],
    ])('uses POSTHOG_HOST env fallback when config host is %s', (_case, pluginConfig) => {
        process.env.POSTHOG_HOST = 'https://eu.i.posthog.com'
        const api = createMockApi(pluginConfig)

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                host: 'https://eu.i.posthog.com',
            })
        )
    })

    test('prefers a nonblank configured host over POSTHOG_HOST', () => {
        process.env.POSTHOG_HOST = 'https://eu.i.posthog.com'
        const api = createMockApi({ apiKey: 'phc_test', host: 'https://self-hosted.example.com' })

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                host: 'https://self-hosted.example.com',
            })
        )
    })

    test('trims surrounding whitespace from a configured host', () => {
        const api = createMockApi({ apiKey: 'phc_test', host: '  https://self-hosted.example.com  ' })

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                host: 'https://self-hosted.example.com',
            })
        )
    })

    test('trims surrounding whitespace from POSTHOG_HOST', () => {
        process.env.POSTHOG_HOST = '  https://eu.i.posthog.com  '
        const api = createMockApi({ apiKey: 'phc_test' })

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                host: 'https://eu.i.posthog.com',
            })
        )
    })

    test('falls back to the default host when neither config nor POSTHOG_HOST is set', () => {
        const api = createMockApi({ apiKey: 'phc_test' })

        plugin.register(api)

        expect(registerPostHogHooksMock).toHaveBeenCalledWith(
            api,
            expect.objectContaining({
                host: 'https://us.i.posthog.com',
            })
        )
    })
})
