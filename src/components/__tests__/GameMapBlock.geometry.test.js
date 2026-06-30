// @vitest-environment happy-dom
import { Buffer } from 'node:buffer'
import { describe, it, expect } from 'vitest'
import GameMapBlock from '../GameMapBlock.vue'
import { computeHexPolygonGeometry, computeSvgMapSize, pointyTopHexPolygonPoints } from '@/domain/engine/hexUtils.js'
import { hexMap } from '../../config/theme.js'

/**
 * Component-method wiring tests for `GameMapBlock`.
 *
 * The pure-helper tests in `src/utils/__tests__/hexUtils.test.js` lock
 * the geometry helpers' output to the pre-refactor inline math. These
 * tests lock the *wiring* — that `GameMapBlock` calls those helpers
 * with the correct arguments (`hexStrokeOffset: 2`, `hexSize =
 * baseHexSize * zoomLevel`, the right width/height source). A future
 * regression like `hexStrokeOffset: 3` or a forgotten zoom multiplier
 * would have slipped past the helper tests; it should fail here.
 *
 * Pattern follows `LevelBuilder.parity.test.js`: call the SFC's
 * `methods.<name>` directly with a stub `this`, avoiding the heavy
 * `shallowMount` setup needed for `GameMapBlock.intent.test.js`.
 */

function callMethod(method, stub, ...args) {
  return GameMapBlock.methods[method].call(stub, ...args)
}

function decodeBase64Utf8(value) {
  return Buffer.from(value, 'base64').toString('utf8')
}

function decodeSvgDataUrl(value) {
  expect(value).toMatch(/^data:image\/svg\+xml/)
  const [, metadata = '', payload = ''] = value.match(/^data:image\/svg\+xml([^,]*),(.*)$/) || []
  if (/;base64/i.test(metadata)) return decodeBase64Utf8(payload)
  return decodeURIComponent(payload)
}

describe('GameMapBlock.computeHexGeometry · wiring to hexUtils helpers', () => {
  it('passes hexStrokeOffset: 2 (preserves pre-refactor visual)', () => {
    const stub = { zoomLevel: 1 }
    const got = callMethod('computeHexGeometry', stub, 3, 4)
    const expected = computeHexPolygonGeometry({
      q: 3,
      r: 4,
      hexSize: hexMap.baseHexSize * 1,
      hexStrokeOffset: 2
    })
    expect(got).toEqual(expected)
  })

  it('does NOT pass hexStrokeOffset: 3 (would regress to Builder offset)', () => {
    const stub = { zoomLevel: 1 }
    const got = callMethod('computeHexGeometry', stub, 3, 4)
    const wrong = computeHexPolygonGeometry({
      q: 3,
      r: 4,
      hexSize: hexMap.baseHexSize * 1,
      hexStrokeOffset: 3
    })
    // Outer points are the same regardless of offset; the discriminator
    // is `innerPoints`. If a regression switched the offset to 3, this
    // assertion would flip.
    expect(got.innerPoints).not.toBe(wrong.innerPoints)
  })

  it('honours the current zoomLevel (hexSize = baseHexSize * zoomLevel)', () => {
    for (const zoom of [0.5, 1, 1.75, 3]) {
      const stub = { zoomLevel: zoom }
      const got = callMethod('computeHexGeometry', stub, 1, 1)
      const expected = computeHexPolygonGeometry({
        q: 1,
        r: 1,
        hexSize: hexMap.baseHexSize * zoom,
        hexStrokeOffset: 2
      })
      expect(got).toEqual(expected)
    }
  })
})

describe('GameMapBlock.getUnitIconPath · player tinting', () => {
  it('requests player-coloured body icons for units on the map', () => {
    const player1Icon = callMethod('getUnitIconPath', {}, {
      type: 'armored',
      iconKey: 'armored',
      player: 'player1'
    }, 'body')
    const player2Icon = callMethod('getUnitIconPath', {}, {
      type: 'armored',
      iconKey: 'armored',
      player: 'player2'
    }, 'body')

    expect(decodeSvgDataUrl(player1Icon)).toContain('fill="#2196F3"')
    expect(decodeSvgDataUrl(player2Icon)).toContain('fill="#DC3545"')
  })
})

describe('GameMapBlock.updateMapDimensions · wiring to computeSvgMapSize', () => {
  it('reads width/height from gameState first (engine is source of truth)', () => {
    const stub = {
      zoomLevel: 1,
      gameState: { width: 7, height: 9 },
      // currentMap fallback intentionally has different dimensions to
      // catch a regression that reads from the wrong source.
      currentMap: { parameters: { width: 3, height: 3 } },
      svgWidth: 0,
      svgHeight: 0
    }
    callMethod('updateMapDimensions', stub)
    const expected = computeSvgMapSize({ width: 7, height: 9, hexSize: hexMap.baseHexSize })
    expect(stub.svgWidth).toBe(expected.svgWidth)
    expect(stub.svgHeight).toBe(expected.svgHeight)
  })

  it('falls back to currentMap.parameters when gameState is absent', () => {
    const stub = {
      zoomLevel: 1,
      gameState: null,
      currentMap: { parameters: { width: 5, height: 8 } },
      svgWidth: 0,
      svgHeight: 0
    }
    callMethod('updateMapDimensions', stub)
    const expected = computeSvgMapSize({ width: 5, height: 8, hexSize: hexMap.baseHexSize })
    expect(stub.svgWidth).toBe(expected.svgWidth)
    expect(stub.svgHeight).toBe(expected.svgHeight)
  })

  it('is a no-op when neither source provides dimensions', () => {
    const stub = {
      zoomLevel: 1,
      gameState: null,
      currentMap: null,
      svgWidth: 42,
      svgHeight: 24
    }
    callMethod('updateMapDimensions', stub)
    expect(stub.svgWidth).toBe(42)
    expect(stub.svgHeight).toBe(24)
  })

  it('scales with zoomLevel', () => {
    const stub = {
      zoomLevel: 2,
      gameState: { width: 4, height: 4 },
      svgWidth: 0,
      svgHeight: 0
    }
    callMethod('updateMapDimensions', stub)
    const expected = computeSvgMapSize({ width: 4, height: 4, hexSize: hexMap.baseHexSize * 2 })
    expect(stub.svgWidth).toBe(expected.svgWidth)
    expect(stub.svgHeight).toBe(expected.svgHeight)
  })
})

describe('GameMapBlock.getUnitHexagonPoints · wiring to pointyTopHexPolygonPoints', () => {
  it('uses radius 10 (matches pre-refactor unit-icon hexSize)', () => {
    const stub = {}
    const got = callMethod('getUnitHexagonPoints', stub, 100, 50)
    const expected = pointyTopHexPolygonPoints({ centerX: 100, centerY: 50, radius: 10 })
    expect(got).toBe(expected)
  })

  it('passes the centerX/centerY arguments unchanged', () => {
    const stub = {}
    const a = callMethod('getUnitHexagonPoints', stub, 0, 0)
    const b = callMethod('getUnitHexagonPoints', stub, 100, 0)
    expect(a).not.toBe(b)
    expect(b).toBe(pointyTopHexPolygonPoints({ centerX: 100, centerY: 0, radius: 10 }))
  })
})
