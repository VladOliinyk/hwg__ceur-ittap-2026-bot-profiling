/**
 * Moves table scope — логіка «чия таблиця активна» та «який рядок D6 підсвітити».
 *
 * Цей модуль **розв’язує** ключі даних JSON (наприклад `Our_operations` / `Enemy_operations`)
 * від **стабільних ідентифікаторів області рендеру** (`'our' | 'enemy'`). UI порівнює
 * `table.scope` з результатами тутешніх функцій, а не з сирими ключами завантаженого рівня —
 * це спрощує локалізацію, додавання гравців і зміну схеми даних без правок шаблонів.
 *
 * @module utils/movesTableScope
 */

import { normalizeDiceFaceForUi } from './diceUi.js'

/**
 * Логічні області турнірної таблиці в UI (не ключі JSON).
 * @readonly
 * @enum {string}
 */
export const TABLE_SCOPES = Object.freeze({
  /** Таблиця сторони, асоційованої з `player1` у двогравцевому режимі. */
  OUR: 'our',
  /** Таблиця сторони, асоційованої з `player2` у двогравцевому режимі. */
  ENEMY: 'enemy'
})

/** @type {ReadonlySet<string>} */
const VALID_TABLE_SCOPES = new Set(Object.values(TABLE_SCOPES))

/**
 * Повертає область таблиці для гравця. Узгоджено з правилом ключів операцій у `gameState`:
 * лише `player2` відображається як «ворожа» таблиця; усі інші id (включно з `player1` і невідомими)
 * — як «наша» (розширення на 3+ гравців: замінити на явний реєстр scope).
 *
 * @param {string} [playerId]
 * @returns {typeof TABLE_SCOPES.OUR|typeof TABLE_SCOPES.ENEMY}
 */
export function getTableScopeForPlayer(playerId) {
  return playerId === 'player2' ? TABLE_SCOPES.ENEMY : TABLE_SCOPES.OUR
}

/**
 * Ключ масиву операцій у turntable JSON. Узгоджено з `turntableOperationsKey` у `gameState.js`
 * (лише `player2` → `Enemy_operations`).
 *
 * @param {string} [playerId]
 * @returns {'Our_operations'|'Enemy_operations'}
 */
export function getTurntableOperationsKeyForPlayer(playerId) {
  return playerId === 'player2' ? 'Enemy_operations' : 'Our_operations'
}

/**
 * Обчислює, чи активна дана таблиця для поточного ходу та який рядок D6 підсвітити.
 *
 * `highlightRowIndex` — **1-based**, у тому ж діапазоні, що й `d-for="diceIndex in maxDiceRows"`
 * (1 … `maxDiceRows`). Якщо кубик ще не зафіксований (`currentRoll` null), або грань не
 * вкладається в кількість рядків таблиці (`currentRoll > maxDiceRows`), рядок не підсвічується.
 * Невідомий `tableScope` (не з `TABLE_SCOPES`) → таблиця неактивна, без підсвітки.
 *
 * @param {string} currentPlayerId
 * @param {number|null|undefined} currentRoll — грань D6 (1–6) або `null` до кидка / після скидання буфера ходу
 * @param {typeof TABLE_SCOPES.OUR|typeof TABLE_SCOPES.ENEMY} tableScope — область **цієї** таблиці в UI
 * @param {number} maxDiceRows — верхня межа рядків D6 у таблиці (узгоджено з `getMaxDiceRows` / даними рівня)
 * @returns {{ isTableActive: boolean, highlightRowIndex: number|null }}
 */
export function calculateActiveHighlight(
  currentPlayerId,
  currentRoll,
  tableScope,
  maxDiceRows
) {
  if (!VALID_TABLE_SCOPES.has(tableScope)) {
    return { isTableActive: false, highlightRowIndex: null }
  }

  const activeScope = getTableScopeForPlayer(currentPlayerId)
  const isTableActive = tableScope === activeScope

  if (!isTableActive) {
    return { isTableActive: false, highlightRowIndex: null }
  }

  const maxRowsRaw = Number(maxDiceRows)
  if (!Number.isFinite(maxRowsRaw)) {
    return { isTableActive: true, highlightRowIndex: null }
  }
  const maxRows = Math.floor(maxRowsRaw)
  if (maxRows < 1) {
    return { isTableActive: true, highlightRowIndex: null }
  }

  const face = normalizeDiceFaceForUi(currentRoll)
  if (face === null) {
    return { isTableActive: true, highlightRowIndex: null }
  }

  if (face > maxRows) {
    return { isTableActive: true, highlightRowIndex: null }
  }

  return { isTableActive: true, highlightRowIndex: face }
}
