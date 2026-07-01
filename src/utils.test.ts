import { beforeEach, describe, expect, test, vi } from 'vitest'

const uuidV7Mock = vi.hoisted(() => vi.fn(() => '019b2f1a-0000-7000-8000-000000000001'))

vi.mock('@posthog/core', () => ({
    uuidv7: uuidV7Mock,
}))

import { generateSpanId, generateTraceId } from './utils.js'

describe('telemetry ID generation', () => {
    beforeEach(() => {
        uuidV7Mock.mockClear()
    })

    test('generateTraceId uses UUID v7', () => {
        expect(generateTraceId()).toBe('019b2f1a-0000-7000-8000-000000000001')
        expect(uuidV7Mock).toHaveBeenCalledTimes(1)
    })

    test('generateSpanId uses UUID v7', () => {
        expect(generateSpanId()).toBe('019b2f1a-0000-7000-8000-000000000001')
        expect(uuidV7Mock).toHaveBeenCalledTimes(1)
    })
})
