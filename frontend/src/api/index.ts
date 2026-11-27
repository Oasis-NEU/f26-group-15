import { createHttpApi } from './httpApi'
import { createMockApi } from './mockApi'
import type { LabelAIApi } from './types'

const mode = (import.meta.env.VITE_API_MODE as string | undefined) ?? 'mock'
const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000'

const mock = mode === 'mock' ? createMockApi() : null

/** The single API object every page imports. */
export const api: LabelAIApi = mock ?? createHttpApi(baseUrl)

export const apiMode = mock ? 'mock' : 'http'

/** Only available with the mock API. */
export const resetMockData = mock ? () => mock.reset() : null

export { ApiError } from './types'
