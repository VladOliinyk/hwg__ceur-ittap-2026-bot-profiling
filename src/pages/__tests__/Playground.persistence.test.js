// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Playground from '../Playground.vue'

/**
 * Component-level coverage for Batch 6 persistence error handling.
 *
 *   Playground.loadSavedGameState()
 *     -> loadGameState() (mocked failure)
 *     -> handleRestoreFailure(result):
 *          - $notify.error with code-specific title
 *          - clearGameState() except for UNSUPPORTED_VERSION
 *
 *   Playground.saveCurrentGameState()
 *     -> saveGameState() (mocked failure)
 *     -> handleSaveFailure(outcome):
 *          - $notify with code-specific level/title
 *          - dedupes identical codes for 10s
 *          - clears dedupe on next successful save
 *
 * The persistence module is mocked so we exercise the Playground's
 * handlers directly without depending on happy-dom's localStorage proxy
 * behavior (which is already covered in the gamePersistence unit tests).
 */

vi.mock('../../utils/gamePersistence', async () => {
  const actual = await vi.importActual('../../utils/gamePersistence')
  return {
    ...actual,
    // Only the functions the Playground calls. `normalizeBool` and the
    // error-code constants are re-exported via `...actual`.
    hasSavedGameState: vi.fn(),
    loadGameState: vi.fn(),
    saveGameState: vi.fn(),
    clearGameState: vi.fn(),
    getLastSavedInfo: vi.fn(() => null)
  }
})

import {
  hasSavedGameState,
  loadGameState,
  saveGameState,
  clearGameState,
  RESTORE_ERROR_CODES,
  SAVE_ERROR_CODES
} from '../../utils/gamePersistence'

const stubChildComponents = {
  HeaderComponent: { template: '<div />' },
  MovesTableBlock: { props: ['movesData', 'gameState'], template: '<div />' },
  TimelineBlock: {
    props: ['gameState', 'levelPackage', 'rngSeed'],
    emits: ['end-turn', 'revert-game', 'import-history'],
    template: '<div />'
  },
  GameMapBlock: {
    props: [
      'mapData', 'terrainTypes', 'gameState', 'gameController',
      'selectedHexDropdownPosition',
      'showFloatingPanel', 'commandSeq', 'attackTargetShiftIntent', 'deselectIntent',
      'actionsDisabled'
    ],
    emits: [
      'hex-selected', 'game-state-updated',
      'update-selected-hex-dropdown-position',
      'update:showFloatingPanel', 'selection-inspector-bridge'
    ],
    template: '<div />'
  },
  GameEngineBlock: {
    props: [
      'selectedHex', 'mapData', 'gameState', 'gameController',
      'isRestoring', 'isInitializingGlobal', 'showFloatingPanel', 'selectionInspectorBridge',
      'levelOptions', 'selectedLevelId', 'seed', 'loadedPackage',
      'loadedSource', 'loadedWarnings', 'isStartingGame'
    ],
    emits: [
      'level-selected', 'seed-updated',
      'load-selected-level', 'upload-archive', 'start-game',
      'game-state-updated', 'reset-game', 'dice-rolling-changed', 'deselect',
      'end-turn', 'restart-game',
      'update:showFloatingPanel', 'move-unit-forward', 'move-unit-reverse',
      'rotate-unit-clockwise', 'rotate-unit-counterclockwise', 'fire',
      'reload', 'attack-target-shift'
    ],
    template: '<div />'
  },
  SelectionBlock: {
    props: [
      'selectedHex', 'gameState', 'showFloatingPanel',
      'selectionInspectorBridge', 'actionsDisabled'
    ],
    emits: [
      'deselect', 'update:showFloatingPanel', 'move-unit-forward', 'move-unit-reverse',
      'rotate-unit-clockwise', 'rotate-unit-counterclockwise', 'fire',
      'reload', 'attack-target-shift'
    ],
    template: '<div />'
  }
}

let notifySpy

beforeEach(() => {
  vi.useFakeTimers()
  hasSavedGameState.mockReset()
  loadGameState.mockReset()
  saveGameState.mockReset()
  clearGameState.mockReset()

  // Default: no saved state on mount so the wrapper boots cleanly. Tests
  // that exercise the restore-failure path override `hasSavedGameState`
  // and `loadGameState` before mounting.
  hasSavedGameState.mockReturnValue(false)
  loadGameState.mockReturnValue({ ok: true, state: null, warnings: [] })
  saveGameState.mockReturnValue({ ok: true })

  notifySpy = { success: vi.fn(), info: vi.fn(), warning: vi.fn(), error: vi.fn() }
  // eslint-disable-next-line no-undef
  window.$notify = notifySpy
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  // eslint-disable-next-line no-undef
  delete window.$notify
})

async function mountWithMockedSave() {
  const wrapper = mount(Playground, {
    global: { stubs: stubChildComponents }
  })
  // mounted() runs loadSavedGameState() but hasSavedGameState returned
  // false above, so the wrapper boots without touching loadGameState.
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('Playground — handleRestoreFailure', () => {
  it('surfaces CORRUPTED_JSON with the "Saved game corrupted" title and clears storage', async () => {
    hasSavedGameState.mockReturnValue(true)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.CORRUPTED_JSON,
      error: 'Saved game JSON is corrupted and cannot be parsed.',
      details: [{ path: '', message: 'Unexpected token' }],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    // The mounted hook awaits loadSavedGameState; flush microtasks so the
    // handler runs before assertions.
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    const [title, body] = notifySpy.error.mock.calls[0]
    expect(title).toBe('Saved game corrupted')
    expect(body).toMatch(/corrupted/i)
    // Detail line is appended below the summary for diagnostics.
    expect(body).toMatch(/Unexpected token/)
    expect(clearGameState).toHaveBeenCalledTimes(1)
  })

  it('surfaces UNSUPPORTED_VERSION with "Saved game too new" title and does NOT clear storage', async () => {
    hasSavedGameState.mockReturnValue(true)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.UNSUPPORTED_VERSION,
      error: 'Saved game version 2 is newer than supported 1.',
      details: [],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    expect(notifySpy.error.mock.calls[0][0]).toBe('Saved game too new')
    // Crucially: the snapshot is NOT cleared, so a newer build will still
    // see it on next mount.
    expect(clearGameState).not.toHaveBeenCalled()
  })

  it('surfaces ENGINE_RESTORE_FAILED with the engine-specific title', async () => {
    hasSavedGameState.mockReturnValue(true)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.ENGINE_RESTORE_FAILED,
      error: 'Engine snapshot could not be restored.',
      details: [{ path: 'gameState', message: 'turntable is null' }],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.error.mock.calls[0][0]).toBe('Engine restore failed')
    expect(clearGameState).toHaveBeenCalledTimes(1)
  })

  it('surfaces INVALID_SHAPE with the generic "Restore failed" title and clears storage', async () => {
    hasSavedGameState.mockReturnValue(true)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.INVALID_SHAPE,
      error: 'Saved game shape is invalid and was not restored.',
      details: [
        { path: 'gameState.hexes', message: 'gameState.hexes must be an array.' },
        { path: 'gameState.units', message: 'gameState.units must be an array.' }
      ],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    const [title, body] = notifySpy.error.mock.calls[0]
    // INVALID_SHAPE has no dedicated title — falls through to the generic
    // "Restore failed" copy. The details[] entries surface in the body.
    expect(title).toBe('Restore failed')
    expect(body).toMatch(/gameState\.hexes/)
    expect(body).toMatch(/gameState\.units/)
    expect(clearGameState).toHaveBeenCalledTimes(1)
  })

  it('surfaces restore STORAGE_UNAVAILABLE with the "Storage unavailable" title and clears storage', async () => {
    hasSavedGameState.mockReturnValue(true)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: 'Local storage read failed.',
      details: [],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    expect(notifySpy.error.mock.calls[0][0]).toBe('Storage unavailable')
    expect(clearGameState).toHaveBeenCalledTimes(1)
  })

  it('surfaces restore warnings as a $notify.warning on a successful load', async () => {
    // The Playground's "no save found" early-return uses `gameState`,
    // `levelId`, or `lastSaved` as discriminators (see comment in
    // `loadSavedGameState`). A real legacy save has at least `lastSaved`
    // populated, so the mock must reflect that — otherwise the
    // early-return fires and the warning toast is intentionally
    // suppressed (cold start should not toast restore warnings).
    loadGameState.mockReturnValue({
      ok: true,
      state: {
        levelId: 'level_legacy',
        rngSeed: null,
        mapData: null,
        terrainTypes: null,
        unitsData: null,
        movesData: null,
        gameState: null,
        selectedHex: null,
        selectedUnit: null,
        selectedHexDropdownPosition: { x: 100, y: 100 },
        selectedHexDropdownVisible: false,
        showFloatingPanel: true,
        lastSaved: '2026-05-20T12:00:00.000Z'
      },
      warnings: [{ path: 'version', message: 'Legacy save without `version` field — migrated to v1 schema.' }]
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(notifySpy.warning).toHaveBeenCalledTimes(1)
    expect(notifySpy.warning.mock.calls[0][0]).toBe('Restore warnings')
    expect(notifySpy.warning.mock.calls[0][1]).toMatch(/Legacy save/i)
    expect(notifySpy.error).not.toHaveBeenCalled()
  })

  it('does NOT call loadGameState through hasSavedGameState — a getItem-throw failure surfaces in the real mount path', async () => {
    // Regression for the P3 issue: previously `loadSavedGameState`
    // gated on `hasSavedGameState()`, which swallows storage errors as
    // `false`. That made the restore `STORAGE_UNAVAILABLE` code
    // unreachable through the real mount path — it could only be
    // exercised handler-side. The fix is to call `loadGameState()`
    // directly. This test asserts that path: with `hasSavedGameState`
    // mocked to `false` (the value it returns on a `getItem` throw),
    // a `loadGameState` that reports `STORAGE_UNAVAILABLE` must still
    // surface the notification.
    hasSavedGameState.mockReturnValue(false)
    loadGameState.mockReturnValue({
      ok: false,
      code: RESTORE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: 'Local storage read failed.',
      details: [],
      warnings: []
    })

    const wrapper = mount(Playground, {
      global: { stubs: stubChildComponents }
    })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()

    expect(loadGameState).toHaveBeenCalled()
    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    expect(notifySpy.error.mock.calls[0][0]).toBe('Storage unavailable')
  })
})

describe('Playground — handleSaveFailure', () => {
  it('surfaces QUOTA_EXCEEDED as a $notify.error with "Save failed (storage full)"', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded. Export the game via Timeline → snapshot to keep your progress.'
    })

    wrapper.vm.saveCurrentGameState()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    const [title, body] = notifySpy.error.mock.calls[0]
    expect(title).toBe('Save failed (storage full)')
    expect(body).toMatch(/quota/i)
    expect(body).toMatch(/Timeline.*snapshot/i)
  })

  it('surfaces STORAGE_UNAVAILABLE as a $notify.warning ("Save disabled")', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.STORAGE_UNAVAILABLE,
      error: 'Local storage is unavailable in this environment.'
    })

    wrapper.vm.saveCurrentGameState()

    expect(notifySpy.warning).toHaveBeenCalledTimes(1)
    expect(notifySpy.warning.mock.calls[0][0]).toBe('Save disabled')
  })

  it('surfaces SERIALIZATION_FAILED as a $notify.warning ("Save failed")', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.SERIALIZATION_FAILED,
      error: 'Failed to stringify game state.'
    })

    wrapper.vm.saveCurrentGameState()

    // SERIALIZATION_FAILED has no dedicated title — falls through to the
    // generic "Save failed" warning copy.
    expect(notifySpy.warning).toHaveBeenCalledTimes(1)
    const [title, body] = notifySpy.warning.mock.calls[0]
    expect(title).toBe('Save failed')
    expect(body).toMatch(/stringify/i)
    // Generic save failures stay as warnings, not errors, because the
    // engine state in memory is still intact — only the auto-save is
    // affected.
    expect(notifySpy.error).not.toHaveBeenCalled()
  })

  it('dedupes identical save-failure codes (only one $notify per repeated failure)', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded.'
    })

    wrapper.vm.saveCurrentGameState()
    wrapper.vm.saveCurrentGameState()
    wrapper.vm.saveCurrentGameState()

    expect(notifySpy.error).toHaveBeenCalledTimes(1)
  })

  it('re-notifies after the 10s dedupe window expires', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded.'
    })

    wrapper.vm.saveCurrentGameState()
    expect(notifySpy.error).toHaveBeenCalledTimes(1)

    // Advance past the 10s dedupe lock.
    vi.advanceTimersByTime(10001)
    wrapper.vm.saveCurrentGameState()
    expect(notifySpy.error).toHaveBeenCalledTimes(2)
  })

  it('clears the dedupe lock on the first successful save after a failure', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded.'
    })

    wrapper.vm.saveCurrentGameState()
    expect(notifySpy.error).toHaveBeenCalledTimes(1)
    expect(wrapper.vm._lastSaveErrorCode).toBe(SAVE_ERROR_CODES.QUOTA_EXCEEDED)

    // Storage recovers.
    saveGameState.mockReturnValue({ ok: true })
    wrapper.vm.saveCurrentGameState()
    expect(wrapper.vm._lastSaveErrorCode).toBe(null)

    // A subsequent failure with the same code now notifies again.
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded.'
    })
    wrapper.vm.saveCurrentGameState()
    expect(notifySpy.error).toHaveBeenCalledTimes(2)
  })

  it('does not throw when $notify is missing — save failure is logged but silent', async () => {
    const wrapper = await mountWithMockedSave()
    // eslint-disable-next-line no-undef
    delete window.$notify
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'Local storage quota exceeded.'
    })

    expect(() => wrapper.vm.saveCurrentGameState()).not.toThrow()
  })
})

describe('Playground — timer cleanup on unmount / resetGame (Finding #35)', () => {
  it('clears a pending persistUiTimer on beforeUnmount so saveCurrentGameState is not called after unmount', async () => {
    const wrapper = await mountWithMockedSave()
    saveGameState.mockClear()

    // Arm the debounce timer
    wrapper.vm.schedulePersistUiState()
    expect(wrapper.vm.persistUiTimer).not.toBeNull()

    // Unmount — should cancel the timer
    wrapper.unmount()

    // Advance time past the 450ms debounce; if the timer survived it would call saveCurrentGameState
    vi.advanceTimersByTime(1000)

    expect(saveGameState).not.toHaveBeenCalled()
  })

  it('sets persistUiTimer to null after unmount clears it', async () => {
    const wrapper = await mountWithMockedSave()

    wrapper.vm.schedulePersistUiState()
    expect(wrapper.vm.persistUiTimer).not.toBeNull()

    wrapper.unmount()

    expect(wrapper.vm.persistUiTimer).toBeNull()
  })

  it('clears a pending _saveErrorResetTimer on beforeUnmount', async () => {
    const wrapper = await mountWithMockedSave()

    // Trigger a save failure so _saveErrorResetTimer gets armed
    saveGameState.mockReturnValue({
      ok: false,
      code: SAVE_ERROR_CODES.QUOTA_EXCEEDED,
      error: 'quota exceeded'
    })
    wrapper.vm.saveCurrentGameState()
    expect(wrapper.vm._saveErrorResetTimer).not.toBeNull()

    wrapper.unmount()

    expect(wrapper.vm._saveErrorResetTimer).toBeNull()
  })

  it('resetGame cancels a pending persistUiTimer before clearGameState so no write-back occurs', async () => {
    vi.stubGlobal('confirm', () => true)
    const wrapper = await mountWithMockedSave()
    saveGameState.mockReturnValue({ ok: true })
    saveGameState.mockClear()

    // Arm the debounce
    wrapper.vm.schedulePersistUiState()
    expect(wrapper.vm.persistUiTimer).not.toBeNull()

    // resetGame must cancel the timer before clearing state
    wrapper.vm.resetGame()

    // Verify timer was cancelled (persistUiTimer is null after reset)
    expect(wrapper.vm.persistUiTimer).toBeNull()

    // Advance time: the debounce must NOT fire a saveCurrentGameState
    vi.advanceTimersByTime(1000)

    // clearGameState (the real one, also mocked) should have been called but
    // saveGameState should NOT have been called by the cancelled debounce
    expect(saveGameState).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
