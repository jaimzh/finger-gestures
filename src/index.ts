/**
 * finger-gestures: multi-finger taps and swipes built on Pointer Events.
 *
 * A gesture starts when the first finger lands and ends when the last finger lifts.
 * Handlers fire after the last finger lifts, so a three-finger gesture never triggers
 * the two-finger handler on the way.
 *
 * Every gesture must first pass one check:
 *   - all fingers landed within `joinMs` of the first one.
 *
 * Then it is a TAP when every finger stayed within `tapSlop` px and the gesture lasted
 * at most `tapMaxMs`. It is a SWIPE when the fingers' average movement is at least
 * `swipeMinDistance` px, lasted at most `swipeMaxMs`, runs mostly along one axis, and
 * every finger went the same way. Pinches, rotations and diagonals match neither.
 */

export type Direction = 'up' | 'down' | 'left' | 'right'

export type RejectReason =
  | 'late'        // a finger landed too long after the first
  | 'too-long'    // a tap lasted too long
  | 'too-slow'    // a swipe lasted too long
  | 'moved'       // moved too far for a tap, not far enough for a swipe (or a pinch)
  | 'diagonal'    // a swipe that is not clearly along one axis
  | 'scattered'   // fingers moved in different directions
  | 'cancelled'   // the browser took over the touches
  | 'no-handler'  // recognised, but nothing is registered for it

interface Base {
  /** Number of fingers in the gesture. */
  fingers: number
  /** Time between the first and last finger landing, in ms. */
  spreadMs: number
  /** Time between the first finger landing and the last finger lifting, in ms. */
  durationMs: number
  /** Where the last finger lifted (client coordinates). */
  x: number
  y: number
  /** The pointerup event that ended the gesture. */
  originalEvent: PointerEvent
}

export interface TapEvent extends Base {
  type: 'tap'
  /** Furthest any finger moved from where it landed, in px. */
  moved: number
}

export interface SwipeEvent extends Base {
  type: 'swipe'
  direction: Direction
  /** Average distance the fingers travelled, in px. */
  distance: number
  /** Average horizontal and vertical movement, in px. Right and down are positive. */
  dx: number
  dy: number
  /** distance / duration, in px per second. */
  velocity: number
}

export interface Rejection {
  reason: RejectReason
  fingers: number
  spreadMs: number
  durationMs: number
  /** Furthest any finger moved, in px. */
  moved: number
  /** Average distance the fingers travelled, in px. */
  distance: number
}

export type TapHandler = (event: TapEvent) => void
export type SwipeHandler = (event: SwipeEvent) => void

export interface GestureHandlers {
  /** Finger count to handler. `{ 2: undo, 3: redo }` */
  tap?: Record<number, TapHandler>
  /**
   * Finger count to a handler for any direction, or to a handler per direction.
   * `{ 2: onAnySwipe, 3: { up: openMenu, down: closeMenu } }`
   */
  swipe?: Record<number, SwipeHandler | Partial<Record<Direction, SwipeHandler>>>
}

export interface GestureOptions {
  /** Maximum time allowed between fingers touching, in ms. */
  maxFingerStartDelayMs?: number
  /** Maximum time a tap may last, in ms. */
  maxTapDurationMs?: number
  /** Maximum movement allowed for a tap, in px. */
  maxTapMovementPx?: number
  /** Minimum distance required for a swipe, in px. */
  minSwipeDistancePx?: number
  /** Maximum time a swipe may last, in ms. */
  maxSwipeDurationMs?: number
  /** Max ms between the first finger landing and each later one. Default 180. */
  /** @deprecated Use maxFingerStartDelayMs instead. */
  joinMs?: number
  /** Tap: max ms from first finger down to last finger up. Default 350. */
  /** @deprecated Use maxTapDurationMs instead. */
  tapMaxMs?: number
  /** Tap: max px any finger may move. Default 14. */
  /** @deprecated Use maxTapMovementPx instead. */
  tapSlop?: number
  /** Swipe: min average px the fingers must travel. Default 48. */
  /** @deprecated Use minSwipeDistancePx instead. */
  swipeMinDistance?: number
  /** Swipe: max ms from first finger down to last finger up. Default 800. */
  /** @deprecated Use maxSwipeDurationMs instead. */
  swipeMaxMs?: number
  /** Which pointer types to listen to. Default all three. */
  pointerTypes?: Array<'touch' | 'pen' | 'mouse'>
  /**
   * Set `touch-action: none` on the element and swallow Safari's gesture events, so the
   * browser does not claim multi-finger touches for zoom or scroll. Default true.
   */
  captureTouch?: boolean
  /** Called when a gesture is not recognised, with the reason. Useful for tuning. */
  onReject?: (info: Rejection) => void
  /** Clock override, for tests. Defaults to performance.now. */
  now?: () => number
}

interface Point { sx: number; sy: number; x: number; y: number; moved: number }

interface Gesture {
  t0: number
  lastDown: number
  lastUp: number
  downs: number
  active: Set<number>
  points: Map<number, Point>
  reason: RejectReason | null
}

const STUCK_MS = 10_000
/** Each finger must cover at least this share of the average swipe distance. */
const SCATTER = 0.35
/** The main axis must beat the other by this factor, or the swipe counts as diagonal. */
const AXIS = 1.3

/**
 * Listen for multi-finger taps and swipes on an element. Returns a function that removes
 * everything it added.
 *
 * @example
 * const stop = fingerGestures(canvas, {
 *   tap: { 2: undo, 3: redo },
 *   swipe: { 3: { up: openMenu, down: closeMenu } },
 * })
 */
export function fingerGestures(
  el: HTMLElement,
  handlers: GestureHandlers,
  options: GestureOptions = {},
): () => void {
  const maxFingerStartDelayMs = options.maxFingerStartDelayMs ?? options.joinMs ?? 180
  const maxTapDurationMs = options.maxTapDurationMs ?? options.tapMaxMs ?? 350
  const maxTapMovementPx = options.maxTapMovementPx ?? options.tapSlop ?? 14
  const minSwipeDistancePx = options.minSwipeDistancePx ?? options.swipeMinDistance ?? 48
  const maxSwipeDurationMs = options.maxSwipeDurationMs ?? options.swipeMaxMs ?? 800
  const types = options.pointerTypes ?? ['touch', 'pen', 'mouse']
  const captureTouch = options.captureTouch ?? true
  const now = options.now ?? (() => performance.now())

  let g: Gesture | null = null

  const fail = (reason: RejectReason) => {
    if (g && g.reason === null) g.reason = reason
  }

  const onDown = (e: PointerEvent) => {
    if (!types.includes(e.pointerType as 'touch' | 'pen' | 'mouse')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const t = now()
    // A gesture that never saw its last pointerup (lost to the browser) must not poison the next one.
    if (g && t - g.t0 > STUCK_MS) g = null
    if (!g) {
      g = { t0: t, lastDown: t, lastUp: t, downs: 0, active: new Set(), points: new Map(), reason: null }
    } else if (t - g.t0 > maxFingerStartDelayMs) {
      fail('late')
    }
    g.downs++
    g.lastDown = t
    g.active.add(e.pointerId)
    g.points.set(e.pointerId, { sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: 0 })
    // Keeps pointerup coming to us even if a mouse leaves the element.
    try { el.setPointerCapture(e.pointerId) } catch { /* not all pointers can be captured */ }
  }

  const onMove = (e: PointerEvent) => {
    if (!g) return
    const p = g.points.get(e.pointerId)
    if (!p) return
    p.x = e.clientX
    p.y = e.clientY
    p.moved = Math.max(p.moved, Math.hypot(p.x - p.sx, p.y - p.sy))
  }

  const onUp = (e: PointerEvent, cancelled: boolean) => {
    if (!g || !g.active.has(e.pointerId)) return
    const p = g.points.get(e.pointerId)
    if (p) {
      p.x = e.clientX
      p.y = e.clientY
      p.moved = Math.max(p.moved, Math.hypot(p.x - p.sx, p.y - p.sy))
    }
    g.active.delete(e.pointerId)
    g.lastUp = now()
    if (cancelled) fail('cancelled')
    if (g.active.size === 0) finish(e)
  }

  const finish = (e: PointerEvent) => {
    const done = g!
    g = null
    const fingers = done.downs
    const spreadMs = Math.round(done.lastDown - done.t0)
    const durationMs = Math.round(done.lastUp - done.t0)
    const pts = Array.from(done.points.values())

    let dx = 0, dy = 0, moved = 0
    for (const p of pts) {
      dx += p.x - p.sx
      dy += p.y - p.sy
      moved = Math.max(moved, p.moved)
    }
    dx /= pts.length
    dy /= pts.length
    const distance = Math.hypot(dx, dy)

    const info = (reason: RejectReason): Rejection => ({
      reason, fingers, spreadMs, durationMs,
      moved: Math.round(moved), distance: Math.round(distance),
    })
    const reject = (reason: RejectReason) => options.onReject?.(info(reason))
    const base = { fingers, spreadMs, durationMs, x: e.clientX, y: e.clientY, originalEvent: e }

    if (done.reason) return reject(done.reason)

    // Tap: nobody moved much.
    if (moved <= maxTapMovementPx) {
      if (durationMs > maxTapDurationMs) return reject('too-long')
      const handler = handlers.tap?.[fingers]
      if (!handler) return reject('no-handler')
      handler({ type: 'tap', ...base, moved: Math.round(moved) })
      return
    }

    // Swipe: the fingers moved together a good distance.
    if (distance >= minSwipeDistancePx) {
      if (durationMs > maxSwipeDurationMs) return reject('too-slow')
      const ax = Math.abs(dx)
      const ay = Math.abs(dy)
      if (Math.max(ax, ay) < AXIS * Math.min(ax, ay)) return reject('diagonal')
      for (const p of pts) {
        const along = ((p.x - p.sx) * dx + (p.y - p.sy) * dy) / distance
        if (along < SCATTER * distance) return reject('scattered')
      }
      const direction: Direction = ax > ay ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
      const entry = handlers.swipe?.[fingers]
      const handler = typeof entry === 'function' ? entry : entry?.[direction]
      if (!handler) return reject('no-handler')
      handler({
        type: 'swipe', ...base, direction,
        distance: Math.round(distance), dx: Math.round(dx), dy: Math.round(dy),
        velocity: Math.round((distance / Math.max(durationMs, 1)) * 1000),
      })
      return
    }

    // Neither: a small drag, a pinch or a rotation.
    reject('moved')
  }

  const up = (e: PointerEvent) => onUp(e, false)
  const cancel = (e: PointerEvent) => onUp(e, true)
  const swallow = (e: Event) => e.preventDefault()

  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', cancel)

  const prevTouchAction = el.style.touchAction
  if (captureTouch) {
    el.style.touchAction = 'none'
    el.addEventListener('gesturestart', swallow)
    el.addEventListener('gesturechange', swallow)
    el.addEventListener('gestureend', swallow)
  }

  return () => {
    el.removeEventListener('pointerdown', onDown)
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', cancel)
    if (captureTouch) {
      el.style.touchAction = prevTouchAction
      el.removeEventListener('gesturestart', swallow)
      el.removeEventListener('gesturechange', swallow)
      el.removeEventListener('gestureend', swallow)
    }
    g = null
  }
}
