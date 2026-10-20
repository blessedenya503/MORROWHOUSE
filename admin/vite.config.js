import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:4243',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})