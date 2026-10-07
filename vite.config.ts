import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    /** Только с туннелем: иначе Vite уйдёт на 5174, а localtunnel останется на 5173 */
    strictPort: process.env.VITE_TUNNEL === '1',
    // Не принудительно задавать hmr для туннеля: wss:443 ломает HMR на localhost:5173.
    // Клиент Vite берёт протокол/хост из import.meta.url (https://*.loca.lt → wss).
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
