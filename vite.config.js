import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // 開発時: Vite(:5173) → Express(:3001) にプロキシ
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
