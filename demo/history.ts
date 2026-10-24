export type Dot = { n: number; x: number; y: number }

export function createHistory() {
  let dots: Dot[] = []
  let redoStack: Dot[] = []
  let counter = 0

  return {
    get dots() { return dots },
    get redoCount() { return redoStack.length },
    add(x: number, y: number) {
      dots.push({ n: ++counter, x, y })
      redoStack = []
    },
    undo() {
      if (!dots.length) return false
      redoStack.push(dots.pop()!)
      return true
    },
    redo() {
      if (!redoStack.length) return false
      dots.push(redoStack.pop()!)
      return true
    },
    clear() {
      dots = []
      redoStack = []
    },
  }
}
