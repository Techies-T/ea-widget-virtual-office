import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5191,
    proxy: {
      '/api/vo': {
        target: 'http://localhost:8091',
        changeOrigin: true
      }
    }
  }
});
