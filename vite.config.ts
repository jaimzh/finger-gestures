import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: 'demo',
  build: {
    outDir: resolve(process.cwd(), 'demo-dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), 'demo/index.html'),
        docs: resolve(process.cwd(), 'demo/docs.html'),
      },
    },
  },
})
