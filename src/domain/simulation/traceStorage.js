export const SIMULATION_TRACE_STORAGE_PREFIX = 'hwg:simulation-trace:'

export function simulationTraceStorageKey(traceId) {
  return `${SIMULATION_TRACE_STORAGE_PREFIX}${traceId}`
}

export function isQuotaExceededError(error) {
  if (!error || typeof error !== 'object') return false
  return error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
}

export function removeStoredSimulationTraces(storage, keepKey = '') {
  if (!storage || typeof storage.length !== 'number' || typeof storage.key !== 'function') return 0
  const keys = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (typeof key === 'string' && key.startsWith(SIMULATION_TRACE_STORAGE_PREFIX) && key !== keepKey) {
      keys.push(key)
    }
  }
  keys.forEach(key => storage.removeItem(key))
  return keys.length
}

export function storeSimulationTrace(storage, traceId, trace) {
  const key = simulationTraceStorageKey(traceId)
  removeStoredSimulationTraces(storage, key)
  storage.setItem(key, JSON.stringify(trace))
  return key
}

// Shared fallback message for the quota-exceeded branch, used by every call
// site that persists a playback trace.
export const TRACE_QUOTA_MESSAGE = 'Playback trace could not be saved because browser session storage is full.'

// Persist a trace via storeSimulationTrace (which evicts every other stored
// trace first), translating the browser quota error into a result object so
// callers never have to repeat the same try/catch. Any NON-quota error is
// rethrown so genuine failures are not swallowed.
export function persistTrace(storage, traceId, trace) {
  try {
    storeSimulationTrace(storage, traceId, trace)
    return { ok: true }
  } catch (error) {
    if (isQuotaExceededError(error)) {
      return { ok: false, quotaExceeded: true }
    }
    throw error
  }
}
