/**
 * Нормалізація грані D6 для UI (захист від NaN / некоректних типів з engine).
 * @param {*} value
 * @returns {number|null} 1–6 або null
 */
export function normalizeDiceFaceForUi(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : null
}

/**
 * Поточний кубик для Vue computed.
 * `bumpKey` — довільна реактивна залежність (напр. лічильник після deep-watch на currentTurnActions).
 * @param {object|null} gs
 * @param {number} bumpKey
 * @returns {number|null}
 */
export function getDiceResultForUi(gs, bumpKey) {
  void bumpKey
  if (!gs || typeof gs.getCurrentDiceResult !== 'function') return null
  const actions = gs.currentTurnActions
  void (Array.isArray(actions) ? actions.length : 0)
  return normalizeDiceFaceForUi(gs.getCurrentDiceResult())
}
