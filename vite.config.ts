import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'demo',
  build: {
    outDir: resolve(process.cwd(), 'demo-dist'),
    emptyOutDir: true,
  },
})
