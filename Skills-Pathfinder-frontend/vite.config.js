import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', // Critical: serves files from root, not a subdirectory
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Your backend dev server
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  }
})


