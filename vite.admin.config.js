// Admin dashboard: a separate small app in admin/, served by the API server at /admin.
// Dev: npm run admin (http://localhost:5174/admin/) · Build: npm run build:admin
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(import.meta.dirname, 'admin'),
  base: '/admin/',
  publicDir: false,
  plugins: [react()],
  build: { outDir: path.resolve(import.meta.dirname, 'server/admin-dist'), emptyOutDir: true },
  server: { port: 5174, proxy: { '/api': 'http://localhost:8000' } },
});
