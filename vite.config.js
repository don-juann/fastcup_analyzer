import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The Node proxy (server/index.js) runs on 8787 and forwards GraphQL
// requests to fastcup so the browser never hits CORS directly.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
})
