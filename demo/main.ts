import {
  fingerGestures,
  type Direction, type Rejection, type SwipeEvent, type TapEvent, type GestureOptions,
} from '../src/index'
import { createHistory } from './history'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const pad = $('pad'), hint = $('hint'), flash = $('flash'), logEl = $('log'), gridEl = $('grid')
const btnUndo = $<HTMLButtonElement>('btnUndo'), btnRedo = $<HTMLButtonElement>('btnRedo')

// ---------- live finger trails ----------
const trail = $<HTMLCanvasElement>('trail')
const trailContext = trail.getContext('2d')!
const trails = new Map<number, Array<[number, number]>>()
function resizeTrail() {
  const bounds = pad.getBoundingClientRect()
  const pixelRatio = window.devicePixelRatio || 1
  trail.width = Math.max(1, Math.round(bounds.width * pixelRatio))
  trail.height = Math.max(1, Math.round(bounds.height * pixelRatio))
  trailContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
}
function drawTrails() {
  const bounds = pad.getBoundingClientRect()
  trailContext.clearRect(0, 0, bounds.width, bounds.height)
  trailContext.strokeStyle = '#0c7868'
  trailContext.fillStyle = '#0c7868'
  trailContext.lineWidth = 3
  trailContext.lineCap = 'round'
  trailContext.lineJoin = 'round'
  for (const points of trails.values()) {
    if (!points.length) continue
    trailContext.beginPath()
    points.forEach(([x, y], index) => index ? trailContext.lineTo(x, y) : trailContext.moveTo(x, y))
    trailContext.stroke()
    const last = points[points.length - 1]!
    trailContext.globalAlpha = 0.2
    trailContext.beginPath()
    trailContext.arc(last[0], last[1], 18, 0, Math.PI * 2)
    trailContext.fill()
    trailContext.globalAlpha = 1
  }
}
function trailPoint(event: PointerEvent): [number, number] {
  const bounds = pad.getBoundingClientRect()
  return [event.clientX - bounds.left, event.clientY - bounds.top]
}
pad.addEventListener('pointerdown', (event) => { trails.set(event.pointerId, [trailPoint(event)]); drawTrails() })
pad.addEventListener('pointermove', (event) => { const points = trails.get(event.pointerId); if (points) { points.push(trailPoint(event)); drawTrails() } })
function clearTrail(event: PointerEvent) { trails.delete(event.pointerId); drawTrails(); window.setTimeout(drawTrails, 260) }
pad.addEventListener('pointerup', clearTrail)
pad.addEventListener('pointercancel', clearTrail)
window.addEventListener('resize', resizeTrail)
resizeTrail()

// ---------- history ----------
const history = createHistory()
let sawGesture = false

function render() {
  pad.querySelectorAll('.dot').forEach((n) => n.remove())
  for (const d of history.dots) {
    const n = document.createElement('div')
    n.className = 'dot'
    n.style.left = d.x * 100 + '%'
    n.style.top = d.y * 100 + '%'
    n.textContent = String(d.n)
    pad.appendChild(n)
  }
  $('nDots').textContent = String(history.dots.length)
  $('nRedo').textContent = String(history.redoCount)
  btnUndo.disabled = !history.dots.length
  btnRedo.disabled = !history.redoCount
  hint.hidden = history.dots.length > 0 || history.redoCount > 0 || sawGesture
}
function showFlash(t: string) {
  flash.textContent = t
  flash.classList.remove('on')
  void flash.offsetWidth
  flash.classList.add('on')
}
const undo = () => { if (history.undo()) { render(); showFlash('UNDO') } else showFlash('NOTHING') }
const redo = () => { if (history.redo()) { render(); showFlash('REDO') } else showFlash('NOTHING') }
const clearAll = () => { history.clear(); render(); showFlash('CLEAR') }

// ---------- grid: rows = fingers, columns = gesture ----------
const KINDS = ['tap', 'up', 'down', 'left', 'right'] as const
const LABEL: Record<string, string> = { tap: 'tap', up: '↑', down: '↓', left: '←', right: '→' }
const ARROW: Record<Direction, string> = { up: '↑', down: '↓', left: '←', right: '→' }
const counts: Record<string, number> = {}
const cells: Record<string, HTMLElement> = {}
gridEl.appendChild(Object.assign(document.createElement('div'), { className: 'h' }))
for (const k of KINDS) gridEl.appendChild(Object.assign(document.createElement('div'), { className: 'h', textContent: LABEL[k] }))
for (let n = 1; n <= 4; n++) {
  gridEl.appendChild(Object.assign(document.createElement('div'), { className: 'r', textContent: n + 'f' }))
  for (const k of KINDS) {
    const c = Object.assign(document.createElement('div'), { className: 'c', textContent: '·' })
    c.setAttribute('aria-label', `${n} finger ${k}`)
    gridEl.appendChild(c)
    cells[`${n}:${k}`] = c
    counts[`${n}:${k}`] = 0
  }
}
function bump(n: number, k: string) {
  const key = `${n}:${k}`, c = cells[key]
  if (!c) return
  counts[key] = (counts[key] ?? 0) + 1
  c.textContent = String(counts[key])
  c.classList.add('has')
  c.classList.remove('hit')
  void c.offsetWidth
  c.classList.add('hit')
}

// ---------- log ----------
function log(cls: 'ok' | 'no' | '', text: string) {
  const d = document.createElement('div')
  d.className = cls
  d.textContent = text
  logEl.prepend(d)
  while (logEl.children.length > 4) logEl.lastElementChild!.remove()
}
log('', `device reports ${navigator.maxTouchPoints || 'unknown'} touch points`)

// ---------- the library ----------
const tapStats = (e: TapEvent) => `spread ${e.spreadMs}ms held ${e.durationMs}ms moved ${e.moved}px`
function onTap(act: string, n: number, after: (e: TapEvent) => void) {
  return (e: TapEvent) => {
    sawGesture = true
    bump(n, 'tap')
    after(e)
    if (n === 1) showFlash('1F TAP')
    log('ok', `${n}f tap  ${tapStats(e)}  -> ${act}`)
    render()
  }
}
const onSwipe = (e: SwipeEvent) => {
  sawGesture = true
  bump(e.fingers, e.direction)
  showFlash(`${e.fingers}F ${ARROW[e.direction]}`)
  log('ok', `${e.fingers}f swipe ${e.direction}  ${e.distance}px  ${e.durationMs}ms  ${e.velocity}px/s  spread ${e.spreadMs}ms`)
  render()
}
const onReject = (r: Rejection) => {
  sawGesture = true
  log('no', `${r.fingers}f  x ${r.reason}  spread ${r.spreadMs}ms  held ${r.durationMs}ms  moved ${r.moved}px`)
  render()
}

const addDot = (e: TapEvent) => {
  const r = pad.getBoundingClientRect()
  history.add((e.x - r.left) / r.width, (e.y - r.top) / r.height)
}

// ---------- sliders re-create the listener with new options ----------
const KEY = 'finger-gestures-demo'
const sliders = [
  { id: 'join', out: 'joinOut', unit: ' ms', def: 180, opt: 'joinMs' },
  { id: 'tapMax', out: 'tapOut', unit: ' ms', def: 350, opt: 'tapMaxMs' },
  { id: 'slop', out: 'slopOut', unit: ' px', def: 14, opt: 'tapSlop' },
  { id: 'swipeMin', out: 'swipeMinOut', unit: ' px', def: 48, opt: 'swipeMinDistance' },
  { id: 'swipeMax', out: 'swipeMaxOut', unit: ' ms', def: 800, opt: 'swipeMaxMs' },
] as const
const input = (id: string) => $<HTMLInputElement>(id)
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}')
  for (const s of sliders) if (typeof saved[s.id] === 'number') input(s.id).value = String(saved[s.id])
} catch { /* storage unavailable */ }

let stop = () => {}
function attach() {
  stop()
  const options: GestureOptions = { onReject }
  for (const s of sliders) (options as Record<string, unknown>)[s.opt] = Number(input(s.id).value)
  stop = fingerGestures(
    pad,
    {
      tap: {
        1: onTap('dot', 1, addDot),
        2: onTap('undo', 2, () => undo()),
        3: onTap('redo', 3, () => redo()),
        4: onTap('clear', 4, () => clearAll()),
      },
      swipe: { 1: onSwipe, 2: onSwipe, 3: onSwipe, 4: onSwipe },
    },
    options,
  )
}
for (const s of sliders) {
  const sync = () => { $(s.out).textContent = input(s.id).value + s.unit }
  input(s.id).addEventListener('input', () => {
    sync()
    attach()
    try {
      const o: Record<string, number> = {}
      for (const t of sliders) o[t.id] = Number(input(t.id).value)
      localStorage.setItem(KEY, JSON.stringify(o))
    } catch { /* ignore */ }
  })
  sync()
}
$('reset').addEventListener('click', () => {
  for (const s of sliders) { input(s.id).value = String(s.def); $(s.out).textContent = s.def + s.unit }
  attach()
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
})
attach()

btnUndo.addEventListener('click', undo)
btnRedo.addEventListener('click', redo)

document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return
  e.preventDefault()
  e.shiftKey ? redo() : undo()
})
render()
