// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fingerGestures, type RejectReason, type TapEvent, type SwipeEvent } from '../src/index'
import { createHistory } from '../demo/history'

// jsdom has no PointerEvent, so give it the two fields the library reads.
if (typeof (globalThis as any).PointerEvent === 'undefined') {
  class PE extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, init: any = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
      this.pointerType = init.pointerType ?? 'touch'
    }
  }
  ;(globalThis as any).PointerEvent = PE
}

let clock = 0
let el: HTMLElement
const taps: TapEvent[] = []
const swipes: SwipeEvent[] = []
const rejects: RejectReason[] = []

function ptr(type: string, id: number, x: number, y: number) {
  el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, button: 0 }))
}
const at = (t: number) => { clock = t }
const startX = (id: number) => 100 + id * 40
const Y0 = 300

/** N fingers land `stagger` ms apart, then are lifted together at `end` ms. */
function tap(n: number, { stagger = 10, end = 120 } = {}) {
  for (let i = 1; i <= n; i++) { at((i - 1) * stagger); ptr('pointerdown', i, startX(i), Y0) }
  at(end)
  for (let i = 1; i <= n; i++) ptr('pointerup', i, startX(i), Y0)
}

/** N fingers land together, travel (dx, dy) in a few steps over `dur` ms, then lift. */
function swipe(n: number, dx: number, dy: number, { dur = 250, per = (_i: number) => [dx, dy] as [number, number] } = {}) {
  at(0)
  for (let i = 1; i <= n; i++) ptr('pointerdown', i, startX(i), Y0)
  const steps = 5
  for (let s = 1; s <= steps; s++) {
    at((dur * s) / steps)
    for (let i = 1; i <= n; i++) {
      const [fx, fy] = per(i)
      ptr('pointermove', i, startX(i) + (fx * s) / steps, Y0 + (fy * s) / steps)
    }
  }
  for (let i = 1; i <= n; i++) {
    const [fx, fy] = per(i)
    ptr('pointerup', i, startX(i) + fx, Y0 + fy)
  }
}

beforeEach(() => {
  clock = 0
  taps.length = 0; swipes.length = 0; rejects.length = 0
  el = document.createElement('div')
  document.body.replaceChildren(el)
  const t = (n: number) => (e: TapEvent) => { expect(e.fingers).toBe(n); taps.push(e) }
  const s = (e: SwipeEvent) => swipes.push(e)
  fingerGestures(
    el,
    {
      tap: { 1: t(1), 2: t(2), 3: t(3), 4: t(4) },
      swipe: {
        2: s,
        3: { up: s, down: s, left: s, right: s },
        4: { up: s, down: s },
      },
    },
    { now: () => clock, onReject: (r) => rejects.push(r.reason) },
  )
})

describe('taps', () => {
  it.each([1, 2, 3, 4])('recognises a %i-finger tap', (n) => {
    tap(n)
    expect(taps.map((e) => e.fingers)).toEqual([n])
    expect(swipes).toEqual([])
  })

  it('reports timing and never fires lower handlers on the way to a bigger tap', () => {
    tap(3, { stagger: 30, end: 140 })
    expect(taps).toHaveLength(1)
    expect(taps[0]).toMatchObject({ type: 'tap', fingers: 3, spreadMs: 60, durationMs: 140, moved: 0 })
  })

  it('allows small wobble', () => {
    at(0); ptr('pointerdown', 1, 100, 100)
    at(20); ptr('pointermove', 1, 105, 103)
    at(60); ptr('pointerup', 1, 105, 103)
    expect(taps).toHaveLength(1)
  })

  it('rejects a late finger', () => {
    tap(2, { stagger: 400, end: 500 })
    expect(taps).toEqual([])
    expect(rejects).toEqual(['late'])
  })

  it('rejects a tap held too long', () => {
    tap(2, { end: 900 })
    expect(rejects).toEqual(['too-long'])
  })

  it('reports no-handler for an unmapped finger count', () => {
    tap(5, { stagger: 10, end: 150 })
    expect(rejects).toEqual(['no-handler'])
  })
})

describe('swipes', () => {
  const dirs = [
    ['up', 0, -140],
    ['down', 0, 140],
    ['left', -140, 0],
    ['right', 140, 0],
  ] as const

  it.each(dirs)('2 fingers swipe %s with the catch-all handler', (d, dx, dy) => {
    swipe(2, dx, dy)
    expect(swipes.map((e) => [e.fingers, e.direction])).toEqual([[2, d]])
    expect(taps).toEqual([])
  })

  it.each(dirs)('3 fingers swipe %s with per-direction handlers', (d, dx, dy) => {
    swipe(3, dx, dy)
    expect(swipes.map((e) => [e.fingers, e.direction])).toEqual([[3, d]])
  })

  it('reports distance, deltas and velocity', () => {
    swipe(2, 120, -10, { dur: 300 })
    expect(swipes).toHaveLength(1)
    const e = swipes[0]!
    expect(e).toMatchObject({ type: 'swipe', direction: 'right', dx: 120, dy: -10, durationMs: 300 })
    expect(e.distance).toBe(120)
    expect(e.velocity).toBe(Math.round((Math.hypot(120, -10) / 300) * 1000))
  })

  it('reports no-handler when a direction is not registered', () => {
    swipe(4, -140, 0) // 4 fingers only registered for up and down
    expect(swipes).toEqual([])
    expect(rejects).toEqual(['no-handler'])
  })

  it('4 fingers up and down work', () => {
    swipe(4, 0, -140)
    swipe(4, 0, 140)
    expect(swipes.map((e) => e.direction)).toEqual(['up', 'down'])
  })

  it('tolerates a lazy swipe that is not perfectly straight', () => {
    swipe(3, 30, -140) // about 12 degrees off vertical
    expect(swipes.map((e) => e.direction)).toEqual(['up'])
  })

  it('rejects a diagonal', () => {
    swipe(3, 100, -100)
    expect(rejects).toEqual(['diagonal'])
  })

  it('rejects a swipe that is too slow', () => {
    swipe(2, 0, -140, { dur: 1500 })
    expect(rejects).toEqual(['too-slow'])
  })

  it('rejects a drag too small for a swipe and too big for a tap', () => {
    swipe(2, 0, -25)
    expect(rejects).toEqual(['moved'])
  })

  it('rejects a pinch', () => {
    swipe(2, 0, 0, { per: (i) => (i === 1 ? [-90, 0] : [90, 0]) })
    expect(swipes).toEqual([])
    expect(rejects).toEqual(['moved'])
  })

  it('rejects fingers going different ways even when the average passes', () => {
    // finger 1 goes up 200, finger 2 barely moves: average 100, finger 2 covers 5 percent of it
    swipe(2, 0, 0, { per: (i) => (i === 1 ? [0, -200] : [0, -10]) })
    expect(rejects).toEqual(['scattered'])
  })

  it('rejects a browser-cancelled gesture', () => {
    at(0); ptr('pointerdown', 1, 100, 100); ptr('pointerdown', 2, 140, 100)
    at(100); ptr('pointercancel', 1, 100, 60); ptr('pointercancel', 2, 140, 60)
    expect(rejects).toEqual(['cancelled'])
  })
})

describe('lifecycle', () => {
  it('handles back-to-back gestures independently', () => {
    tap(1)
    clock = 1000
    swipe(2, 0, -140)
    expect(taps).toHaveLength(1)
    expect(swipes).toHaveLength(1)
  })

  it('recovers when a gesture never finished', () => {
    at(0); ptr('pointerdown', 1, 100, 100) // pointerup lost
    at(20_000); ptr('pointerdown', 5, 100, 100)
    at(20_050); ptr('pointerup', 5, 100, 100)
    expect(taps.map((e) => e.fingers)).toEqual([1])
  })

  it('stops listening after cleanup and restores touch-action', () => {
    const el2 = document.createElement('div')
    el2.style.touchAction = 'pan-y'
    const fn = vi.fn()
    const stop = fingerGestures(el2, { tap: { 1: fn } })
    expect(el2.style.touchAction).toBe('none')
    stop()
    expect(el2.style.touchAction).toBe('pan-y')
    el2.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, pointerType: 'touch' }))
    el2.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch' }))
    expect(fn).not.toHaveBeenCalled()
  })
})

describe('demo history', () => {
  it('adds dots and moves the latest dot through undo and redo', () => {
    const history = createHistory()
    history.add(0.2, 0.4)
    history.add(0.6, 0.8)

    expect(history.dots).toHaveLength(2)
    expect(history.undo()).toBe(true)
    expect(history.dots).toHaveLength(1)
    expect(history.redoCount).toBe(1)
    expect(history.redo()).toBe(true)
    expect(history.dots).toHaveLength(2)
  })

  it('returns false when there is nothing to undo or redo', () => {
    const history = createHistory()

    expect(history.undo()).toBe(false)
    expect(history.redo()).toBe(false)
  })

  it('clears redo history when a new dot is added after undo', () => {
    const history = createHistory()
    history.add(0.2, 0.4)
    history.undo()
    history.add(0.6, 0.8)

    expect(history.redoCount).toBe(0)
  })
})
