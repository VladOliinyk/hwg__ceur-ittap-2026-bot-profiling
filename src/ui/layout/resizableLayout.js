export const LAYOUT_RATIO_EPSILON = 0.01

export function layoutKeys(config) {
  return Object.keys(config)
}

export function defaultLayoutRatios(config) {
  const ratios = {}
  layoutKeys(config).forEach(key => {
    ratios[key] = config[key].defaultRatio
  })
  return normalizeLayoutRatios(ratios, config)
}

export function normalizeLayoutRatios(source, config) {
  const ratios = {}
  let total = 0
  layoutKeys(config).forEach(key => {
    const fallback = config[key].defaultRatio
    const value = Number(source && source[key])
    const normalizedValue = Number.isFinite(value) && value > 0 ? value : fallback
    ratios[key] = normalizedValue
    total += normalizedValue
  })
  if (total <= 0) {
    return defaultLayoutRatios(config)
  }
  layoutKeys(config).forEach(key => {
    ratios[key] = ratios[key] / total
  })
  return ratios
}

export function ratiosMatchDefaults(ratios, config) {
  const normalized = normalizeLayoutRatios(ratios, config)
  const defaults = defaultLayoutRatios(config)
  return layoutKeys(config).every(
    key => Math.abs(normalized[key] - defaults[key]) <= LAYOUT_RATIO_EPSILON
  )
}

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function sumTrackSizes(tracks) {
  return Object.values(tracks).reduce((sum, value) => sum + value, 0)
}

export function fitLayoutTracksToAvailable(rawTracks, available, config) {
  const keys = layoutKeys(config)
  const tracks = {}
  keys.forEach(key => {
    const value = Number(rawTracks[key])
    tracks[key] = clampNumber(
      Number.isFinite(value) ? value : 0,
      config[key].min,
      config[key].max
    )
  })

  let diff = available - sumTrackSizes(tracks)
  for (let guard = 0; Math.abs(diff) > 0.5 && guard < 8; guard++) {
    const isGrowing = diff > 0
    const candidates = keys.filter(key => {
      return isGrowing
        ? tracks[key] < config[key].max
        : tracks[key] > config[key].min
    })
    if (candidates.length === 0) break

    const roomTotal = candidates.reduce((sum, key) => {
      return sum + (isGrowing ? config[key].max - tracks[key] : tracks[key] - config[key].min)
    }, 0)
    if (roomTotal <= 0) break

    const adjustment = Math.abs(diff)
    candidates.forEach(key => {
      const room = isGrowing ? config[key].max - tracks[key] : tracks[key] - config[key].min
      const step = Math.min(adjustment * (room / roomTotal), room)
      tracks[key] += isGrowing ? step : -step
    })
    diff = available - sumTrackSizes(tracks)
  }

  return tracks
}

export function buildLayoutTracksFromRatios(ratios, available, config) {
  const normalized = normalizeLayoutRatios(ratios, config)
  const rawTracks = {}
  layoutKeys(config).forEach(key => {
    rawTracks[key] = available * normalized[key]
  })
  return fitLayoutTracksToAvailable(rawTracks, available, config)
}

export function layoutRatiosFromTracks(tracks, config) {
  const total = sumTrackSizes(tracks)
  if (total <= 0) return defaultLayoutRatios(config)
  const ratios = {}
  layoutKeys(config).forEach(key => {
    ratios[key] = tracks[key] / total
  })
  return ratios
}

export function resizeLayoutTrackPair(currentTracks, splitter, delta, config) {
  const before = splitter.before
  const after = splitter.after
  const pairTotal = Number(currentTracks[before]) + Number(currentTracks[after])
  if (!Number.isFinite(pairTotal) || pairTotal <= 0) return currentTracks

  const lower = Math.max(config[before].min, pairTotal - config[after].max)
  const upper = Math.min(config[before].max, pairTotal - config[after].min)
  const nextBefore = clampNumber(Number(currentTracks[before]) + delta, lower, Math.max(lower, upper))

  return {
    ...currentTracks,
    [before]: nextBefore,
    [after]: pairTotal - nextBefore
  }
}
