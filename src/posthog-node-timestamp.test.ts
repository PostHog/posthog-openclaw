import { afterEach, describe, expect, test, vi } from 'vitest'
import { PostHog } from 'posthog-node'

const originalTimezone = process.env.TZ
const originalCaptureMode = process.env.POSTHOG_CAPTURE_MODE

afterEach(() => {
    vi.useRealTimers()
    if (originalTimezone === undefined) {
        delete process.env.TZ
    } else {
        process.env.TZ = originalTimezone
    }
    if (originalCaptureMode === undefined) {
        delete process.env.POSTHOG_CAPTURE_MODE
    } else {
        process.env.POSTHOG_CAPTURE_MODE = originalCaptureMode
    }
})

describe('posthog-node event timestamps', () => {
    test('serializes SDK-generated event and batch timestamps as UTC ISO strings', async () => {
        process.env.TZ = 'America/Los_Angeles'
        delete process.env.POSTHOG_CAPTURE_MODE
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2025-01-15T12:34:56.789-08:00'))

        const requests: Array<{ body?: unknown }> = []
        const client = new PostHog('phc_test', {
            host: 'https://example.com',
            disableCompression: true,
            flushAt: 1,
            fetch: async (_url, options) => {
                requests.push({ body: options.body })
                return new Response(null, { status: 200 })
            },
        })

        client.capture({ distinctId: 'user-1', event: '$ai_generation', properties: {} })
        await client.shutdown()

        expect(requests).toHaveLength(1)
        const payload = JSON.parse(String(requests[0]!.body))
        expect(payload.sent_at).toBe('2025-01-15T20:34:56.789Z')
        expect(payload.batch[0].timestamp).toBe('2025-01-15T20:34:56.789Z')
    })
})
