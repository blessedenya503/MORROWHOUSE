import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

function blockAdminFromPublicServer() {
  return {
    name: 'block-admin-from-public-server',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split('?')[0] || ''
        if (pathname === '/admin' || pathname.startsWith('/admin/')) {
          response.statusCode = 404
          response.end('Not found')
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [blockAdminFromPublicServer(), react(), tailwindcss()],
  server: {
    fs: {
      deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', 'admin/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:4242',
    },
  },
})
