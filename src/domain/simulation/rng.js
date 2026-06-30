/**
 * Deterministic pseudo-random number generator for headless simulations.
 *
 * The runner, dice rolls, unit placement shuffles and strategy choices
 * must consume randomness from a single seedable source so that
 * `runMatch({ seed })` is reproducible across machines and Node versions.
 *
 * Algorithm: Mulberry32. Cheap, 32-bit state, well-known good output for
 * non-cryptographic uses. Seeds accept numbers or arbitrary strings;
 * strings are hashed through xmur3 so two different strings reliably
 * produce different streams.
 *
 * @module domain/simulation/rng
 */

const TWO_POW_32 = 0x100000000

/**
 * xmur3 string hash → 32-bit seed. Same string always produces the same
 * seed; different strings almost always produce different seeds.
 *
 * @param {string} str
 * @returns {number} unsigned 32-bit integer
 */
function xmur3(str) {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.trunc(seed) >>> 0)
  }
  if (typeof seed === 'string') {
    return xmur3(seed)
  }
  if (seed == null) {
    return xmur3('')
  }
  return xmur3(String(seed))
}

/**
 * Build a Mulberry32-backed RNG.
 *
 * The returned object exposes both the raw `next()` (float ∈ [0, 1))
 * and integer helpers callers actually need (`nextInt`, `pickOne`,
 * `shuffle`). `fork(label)` produces a derived independent stream so
 * components that want isolation from the shared global stream can opt
 * in without breaking determinism.
 *
 * Two construction modes:
 *   - `createRng(seed)` — fresh stream from a number/string/null seed.
 *     The seed is normalized (strings hashed through xmur3), and the
 *     all-zero degenerate state is replaced with a non-zero fallback.
 *   - `createRng({ state })` — resume an existing stream from a value
 *     previously produced by `stateSnapshot()`. Bypasses normalization
 *     and the zero-state guard so the post-restore stream continues
 *     exactly where the original left off, even if the mid-flight
 *     state legitimately hit zero.
 *
 * @param {number|string|{state:number}} [seedOrConfig]
 * @returns {{
 *   next: () => number,
 *   nextInt: (maxExclusive: number) => number,
 *   nextIntInRange: (minInclusive: number, maxExclusive: number) => number,
 *   pickOne: <T>(items: T[]) => T,
 *   shuffle: <T>(items: T[]) => T[],
 *   fork: (label?: string) => any,
 *   seed: number,
 *   stateSnapshot: () => number
 * }}
 */
export function createRng(seedOrConfig) {
  let state
  if (
    seedOrConfig != null &&
    typeof seedOrConfig === 'object' &&
    Object.prototype.hasOwnProperty.call(seedOrConfig, 'state')
  ) {
    state = (Number(seedOrConfig.state) >>> 0)
  } else {
    state = normalizeSeed(seedOrConfig)
    // Avoid the all-zero state degenerate case for Mulberry32.
    if (state === 0) state = 0x9e3779b9
  }

  function next() {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / TWO_POW_32
  }

  function nextInt(maxExclusive) {
    const m = Math.trunc(Number(maxExclusive))
    if (!Number.isFinite(m) || m <= 0) {
      throw new Error(`nextInt: maxExclusive must be a positive integer, got ${maxExclusive}`)
    }
    return Math.floor(next() * m)
  }

  function nextIntInRange(minInclusive, maxExclusive) {
    const lo = Math.trunc(Number(minInclusive))
    const hi = Math.trunc(Number(maxExclusive))
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
      throw new Error(`nextIntInRange: invalid bounds [${minInclusive}, ${maxExclusive})`)
    }
    return lo + nextInt(hi - lo)
  }

  function pickOne(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('pickOne: items must be a non-empty array')
    }
    return items[nextInt(items.length)]
  }

  function shuffle(items) {
    if (!Array.isArray(items)) {
      throw new Error('shuffle: items must be an array')
    }
    // In-place Fisher-Yates so the return value is the same reference;
    // callers that need to preserve the original should pass a copy.
    for (let i = items.length - 1; i > 0; i--) {
      const j = nextInt(i + 1)
      ;[items[i], items[j]] = [items[j], items[i]]
    }
    return items
  }

  function fork(label) {
    // Derive a deterministic child seed from the current state and label.
    // Mixing in `label` ensures distinct named forks diverge immediately.
    const labelHash = label != null ? xmur3(String(label)) : 0x517cc1b7
    const mixed = ((state ^ labelHash) + 0x9E3779B9) >>> 0
    return createRng(mixed)
  }

  return {
    next,
    nextInt,
    nextIntInRange,
    pickOne,
    shuffle,
    fork,
    seed: state,
    stateSnapshot: () => state
  }
}

/**
 * Roll a fair D6 (1-6) using the given RNG.
 * Kept here so simulation code never reaches for `Math.random()`.
 *
 * @param {{ nextInt: (n: number) => number }} rng
 * @returns {number} 1..6
 */
export function rollD6(rng) {
  return rng.nextInt(6) + 1
}
