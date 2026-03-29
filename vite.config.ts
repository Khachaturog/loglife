import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // dev:mobile (localtunnel): страница с https://*.loca.lt — HMR должен идти как wss:443, иначе клиент падает на ws:5173
    hmr:
      process.env.VITE_TUNNEL === '1'
        ? { protocol: 'wss', clientPort: 443 }
        : undefined,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
})
