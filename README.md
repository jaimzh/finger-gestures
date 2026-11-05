<div align="center">
  <img src="./finger-gestures-logo.svg" alt="finger-gestures logo" width="96" />
  <h1>finger-gestures</h1>
  <p>Multi-finger taps and swipes for the web.</p>
  <p>
    <a href="https://finger-gestures.vercel.app/"><img src="https://img.shields.io/badge/demo-try%20it-0c7868" alt="Try the live demo" /></a>
    <a href="https://www.npmjs.com/package/finger-gestures"><img src="https://img.shields.io/npm/v/finger-gestures?label=npm" alt="npm version" /></a>
    <a href="https://www.npmjs.com/package/finger-gestures"><img src="https://img.shields.io/npm/dm/finger-gestures?label=downloads" alt="npm monthly downloads" /></a>
    <a href="https://github.com/jaimzh/finger-gestures"><img src="https://img.shields.io/badge/source-GitHub-181717?logo=github" alt="View source on GitHub" /></a>
  </p>
</div>

Two-finger tap to undo, three-finger swipe up, four-finger tap, or any finger count and direction you need. About 1.3 KB gzipped, zero dependencies, and fully typed.

Explore the gestures in your browser, or install the package and add multi-finger taps and swipes to your own app.

```ts
import { fingerGestures } from 'finger-gestures'

const stop = fingerGestures(canvas, {
  tap: {
    2: () => undo(),
    3: () => redo(),
  },
  swipe: {
    3: { up: () => openMenu(), down: () => closeMenu() },
    2: (e) => console.log('two-finger swipe', e.direction),
  },
})

// later
stop()
```

## Handlers

`fingerGestures(element, handlers, options?)` returns a function that removes everything.

```ts
{
  tap:   { [fingers]: (event) => void },
  swipe: { [fingers]: (event) => void | { up?, down?, left?, right? } },
}
```

For swipes, give a single function to catch every direction (read `event.direction`), or an object with one function per direction. Finger counts and directions you do not list are ignored.

**Tap event:** `fingers`, `spreadMs`, `durationMs`, `moved`, `x`, `y`, `originalEvent`.

**Swipe event:** `fingers`, `direction` (`'up' | 'down' | 'left' | 'right'`), `distance`, `dx`, `dy`, `velocity` (px/s), `spreadMs`, `durationMs`, `x`, `y`, `originalEvent`.

## How it decides

A gesture starts when the first finger lands and ends when the last finger lifts. Handlers fire after the last finger lifts, so a three-finger gesture never triggers the two-finger handler on the way.

First, every finger must land within `joinMs` of the first one. Then:

| It is a... | When |
| --- | --- |
| **Tap** | No finger moved more than `tapSlop` px, and it lasted at most `tapMaxMs`. |
| **Swipe** | The fingers' average movement is at least `swipeMinDistance` px, it lasted at most `swipeMaxMs`, it runs mostly along one axis, and every finger went the same way. |
| **Neither** | Everything else: a small drag, a pinch, a rotation, a diagonal. |

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `joinMs` | `180` | Max ms between the first finger landing and each later one |
| `tapMaxMs` | `350` | Tap: max ms from first finger down to last finger up |
| `tapSlop` | `14` | Tap: max px any finger may move |
| `swipeMinDistance` | `48` | Swipe: min average px the fingers must travel |
| `swipeMaxMs` | `800` | Swipe: max ms from first finger down to last finger up |
| `pointerTypes` | `['touch','pen','mouse']` | Pointer types to listen to |
| `captureTouch` | `true` | Sets `touch-action: none` on the element and blocks Safari gesture events |
| `onReject` | none | Called when a gesture is not recognised (below) |

`onReject` receives `{ reason, fingers, spreadMs, durationMs, moved, distance }`. Reasons:

| Reason | Meaning |
| --- | --- |
| `late` | A finger landed too long after the first |
| `too-long` | A tap lasted too long |
| `too-slow` | A swipe lasted too long |
| `moved` | Moved too far for a tap and not far enough for a swipe, or a pinch |
| `diagonal` | A swipe not clearly along one axis |
| `scattered` | Fingers moved in different directions |
| `cancelled` | The browser or OS took over the touches |
| `no-handler` | Recognised, but nothing is registered for it |

Use `onReject` while tuning. It tells you which check failed.

## Limits

- It works on the element you give it. It cannot override gestures the OS reserves: the 3-finger screenshot on some Android phones, app switching on iPad, iOS's system undo gesture inside a text field. When the OS takes a gesture, you get a `cancelled` rejection. For text fields, listen for `beforeinput` with `inputType` `historyUndo` / `historyRedo` instead.
- `captureTouch` stops the browser from scrolling or zooming on that element. Leave it on for canvases and editors, turn it off if the element must still scroll.
- Four fingers have to land within `joinMs`. If four-finger gestures log `late` on your device, raise it.
- Swipes are four-way. Diagonals are rejected on purpose.
- Trackpad multi-finger swipes arrive as wheel events, not pointers, and are not covered.

## Develop

```bash
npm install
npm run dev      # demo page, also served on your LAN so you can open it on a phone
npm test
npm run build
```

## Behind the project

Read the [story behind finger-gestures](https://jaimz.is-a.dev/dumps/making-my-first-library).

## License

MIT
