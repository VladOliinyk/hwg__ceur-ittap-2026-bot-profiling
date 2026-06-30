/**
 * Deterministic uniform-random strategy.
 *
 * Picks a legal command uniformly at random from the list provided by
 * `listLegalCommands`. By default it biases away from `endTurn` while
 * other commands exist, so headless test matches actually execute
 * actions rather than degenerating into "pass / pass / pass".
 *
 * The returned function is pure with respect to the provided `rng` —
 * given the same RNG sequence and the same `legalCommands` list, it
 * returns the same command. That property is what `runMatch`
 * determinism tests depend on.
 *
 * @module domain/simulation/strategies/randomStrategy
 */

/**
 * @param {{preferAction?: boolean}} [options]
 * @returns {(observation: object, legalCommands: object[], rng: { nextInt: (n:number) => number, pickOne: <T>(arr:T[]) => T }) => object|null}
 */
export function randomStrategy(options = {}) {
  const preferAction = options.preferAction !== false

  return function chooseCommand(observation, legalCommands, rng) {
    if (!Array.isArray(legalCommands) || legalCommands.length === 0) {
      return null
    }
    if (!rng || typeof rng.nextInt !== 'function') {
      throw new Error('randomStrategy: rng with nextInt() is required')
    }

    let pool = legalCommands
    if (preferAction) {
      const nonEndTurn = legalCommands.filter(c => c && c.type !== 'endTurn')
      if (nonEndTurn.length > 0) pool = nonEndTurn
    }
    const idx = rng.nextInt(pool.length)
    return pool[idx]
  }
}
