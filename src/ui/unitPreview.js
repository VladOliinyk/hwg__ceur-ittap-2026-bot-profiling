/**
 * Shared, stateless unit-preview logic (Finding #42).
 *
 * GameEngineBlock.vue (interactive turn controls) and AutomatedPlayground.vue
 * (trace playback) rendered byte-for-byte the same unit-card / available-actions
 * markup and carried ~12 near-verbatim copies of the helpers that feed it. The
 * functions below are the single source of truth; both pages import them and the
 * per-page differences (which `turnState` to read, whether a unit is selected,
 * the human-readable card title) are passed in as parameters so NO behavior
 * changes for either caller.
 *
 * Pure: none of these touch component state or i18n directly. Callers that need
 * a localized string (the card title, the progress aria-label) resolve it on
 * their side and hand it in — that keeps the divergent title (GEB shows catalog
 * type + HP, AP shows name + facing) exactly as it was.
 */
import { getUnitIcon } from '../assets/icons/index.js'
import { computeProgressSegments } from '../utils/unitUiProgress.js'
import { pointyTopHexPolygonPoints } from '@/domain/engine/hexUtils.js'

/** Hex outline points for the unit-card SVG. Identical const in both pages. */
export const UNIT_CARD_HEX_POINTS = pointyTopHexPolygonPoints({
  centerX: 39,
  centerY: 45,
  radius: 43
})

export function isUnitAlive(unit) {
  if (!unit) return false
  if (typeof unit.isAlive === 'function') return unit.isAlive()
  return unit.isActive !== false && Number(unit.health ?? 1) > 0
}

export function normalizeUnitHealth(unit) {
  const rawMax = Number(unit && unit.maxHealth)
  const rawHealth = Number(unit && unit.health)
  const max = Number.isFinite(rawMax) && rawMax > 0 ? rawMax : 100
  const health = Number.isFinite(rawHealth) ? Math.max(0, Math.min(rawHealth, max)) : max
  return {
    health,
    max,
    percent: max > 0 ? Math.round((health / max) * 100) : 0
  }
}

export function getUnitIconPath(unitOrType, iconType = 'body') {
  const unitType = unitOrType && typeof unitOrType === 'object'
    ? (unitOrType.iconKey || unitOrType.type)
    : unitOrType
  if (!unitType) return null
  return getUnitIcon(unitType, iconType)
}

export function unitFacingDegrees(facing) {
  const n = Number(facing)
  const safe = Number.isInteger(n) ? ((n % 6) + 6) % 6 : 0
  return safe * 60 + 30
}

export function formatOperationTitle(title) {
  const text = title == null ? '' : String(title).trim()
  if (!text) return ''
  const lower = text.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

export function getMoveDiceActions(move, diceIndex) {
  if (!move || !Array.isArray(move.dice)) return []
  const idx = Number(diceIndex)
  if (!Number.isInteger(idx) || idx < 0) return []
  const list = move.dice[idx]
  return Array.isArray(list) ? list : []
}

export function operationDiceGroups(operation, diceIndex) {
  const moves = operation && Array.isArray(operation.moves) ? operation.moves : []
  if (moves.length === 0) {
    return [{
      id: `${operation && operation.id ? operation.id : 'op'}-empty-${diceIndex}`,
      title: '-',
      showTitle: false,
      actions: []
    }]
  }
  return moves.map((move, moveIndex) => {
    const actions = getMoveDiceActions(move, diceIndex)
    return {
      id: `${operation.id || 'op'}-move-${move.id || moveIndex}-${diceIndex}`,
      title: move && move.title ? move.title : '-',
      showTitle: moves.length > 1,
      actions
    }
  })
}

export function actionChips(actions, showPriority) {
  const source = Array.isArray(actions) ? actions : []
  return source.map((action, index) => ({
    key: `${index}-${action}`,
    label: action,
    priority: showPriority ? index + 1 : null
  }))
}

/**
 * Movement/action progress segments for a unit.
 *
 * `turnState` is supplied by the caller because the two pages read it from
 * different places (GEB: `gameState.turnState`, AP: `snapshotEngine.turnState`).
 * Body is otherwise identical, including the 16-segment cap.
 *
 * @param {object} unit
 * @param {object|null|undefined} turnState  Per-unit-id action rows.
 */
export function computeUnitProgress(unit, turnState) {
  const unitId = unit && unit.id
  const rows = turnState && typeof turnState === 'object' ? turnState : null
  const row = unitId && rows ? rows[unitId] : null
  const fallback = unit && Number.isFinite(Number(unit.movement)) ? Number(unit.movement) : 0
  const actions = row && Number.isFinite(Number(row.actionsRemaining))
    ? Number(row.actionsRemaining)
    : fallback
  return computeProgressSegments(unit && unit.movement, actions, 16)
}

/**
 * Build the 12-field preview object the unit card renders.
 *
 * Per-page differences are passed via `options`:
 *  - `turnState`     — source for progress (see computeUnitProgress).
 *  - `isSelected`    — GEB compares against the bridge's selected unit id; AP
 *                      compares the selected hex coords to the unit position.
 *  - `title`         — pre-resolved, localized card title (INTENTIONALLY
 *                      divergent between pages — do not unify here).
 *  - `progressLabel` — pre-resolved, localized aria-label for the progress dots.
 *                      Optional; falls back to the bare "actions/total" string,
 *                      which both pages localize via the same i18n key.
 *
 * @param {object} unit
 * @param {{ turnState?: object, isSelected?: boolean, title?: string, progressLabel?: string }} [options]
 */
export function computeUnitPreview(unit, options = {}) {
  const { turnState = null, isSelected = false, title = '', progressLabel } = options
  const progress = computeUnitProgress(unit, turnState)
  const hp = normalizeUnitHealth(unit)
  const alive = isUnitAlive(unit)
  return {
    id: String(unit.id),
    unit,
    title,
    progress,
    progressLabel: progressLabel != null
      ? progressLabel
      : `Actions ${progress.normalizedActions}/${progress.normalizedMovement}`,
    healthLabel: `${hp.health}/${hp.max}`,
    healthPercent: hp.percent,
    bodyIcon: getUnitIconPath(unit, 'body'),
    arrowIcon: getUnitIconPath(unit, 'arrow'),
    arrowTransform: `rotate(${unitFacingDegrees(unit.facing)}deg)`,
    playerClass: unit.player === 'player2' ? 'is-player2' : 'is-player1',
    isSelected: !!isSelected,
    isAlive: alive
  }
}
