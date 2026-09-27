/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (normalizedId.includes('/node_modules/')) {
            if (normalizedId.includes('/@supabase/')) {
              return 'vendor-supabase';
            }
            if (normalizedId.includes('/motion/') || normalizedId.includes('/framer-motion/')) {
              return 'vendor-motion';
            }
            if (normalizedId.includes('/@tanstack/')) {
              return 'vendor-query';
            }
            if (
              normalizedId.includes('/react/') ||
              normalizedId.includes('/react-dom/') ||
              normalizedId.includes('/react-router/') ||
              normalizedId.includes('/react-router-dom/') ||
              normalizedId.includes('/scheduler/')
            ) {
              return 'vendor-react';
            }
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./supabase/functions/_shared', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/_shared/**/*.test.ts'],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
