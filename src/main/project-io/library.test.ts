import { mkdirSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let userData: string

vi.mock('electron', () => ({
  app: { getPath: () => userData }
}))

import {
  LibraryStore,
  getAutoTranscribe,
  setAutoTranscribe,
  getCopilotBaseUrl,
  setCopilotBaseUrl,
  getCopilotModel,
  setCopilotModel
} from './library'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'magnetic-library-'))
  userData = join(dir, 'userData')
  mkdirSync(userData, { recursive: true })
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('rememberAsLastUsed', () => {
  it('preserves other settings keys instead of clobbering them', () => {
    const store = LibraryStore.create(join(dir, 'Test.mglib'))
    setAutoTranscribe(false)
    store.rememberAsLastUsed()
    expect(getAutoTranscribe()).toBe(false) // was wiped back to default true
    expect(LibraryStore.resolveStartupPath()).toBe(join(dir, 'Test.mglib'))
  })
})

describe('copilot endpoint settings', () => {
  it('round-trips a base URL and model id', () => {
    setCopilotBaseUrl('http://127.0.0.1:8081')
    setCopilotModel('claude-sonnet-4-5')
    expect(getCopilotBaseUrl()).toBe('http://127.0.0.1:8081')
    expect(getCopilotModel()).toBe('claude-sonnet-4-5')
  })

  it('treats null and empty string as delete', () => {
    setCopilotBaseUrl('http://127.0.0.1:8081')
    setCopilotBaseUrl(null)
    expect(getCopilotBaseUrl()).toBeNull()
    setCopilotModel('m1')
    setCopilotModel('')
    expect(getCopilotModel()).toBeNull()
  })

  it('trims stored values and treats whitespace-only as delete', () => {
    setCopilotBaseUrl('  http://127.0.0.1:8081  ')
    expect(getCopilotBaseUrl()).toBe('http://127.0.0.1:8081')
    setCopilotBaseUrl('   ')
    expect(getCopilotBaseUrl()).toBeNull()
    setCopilotModel('  m2  ')
    expect(getCopilotModel()).toBe('m2')
    setCopilotModel('   ')
    expect(getCopilotModel()).toBeNull()
  })
})
