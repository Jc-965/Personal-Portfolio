import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          // The hero imports only the Three.js source modules it needs. Keep
          // the full package entry used by the hidden Sketchbook isolated so
          // it never gets folded back into the hero's critical 3D chunk.
          if (id.includes('/node_modules/three/build/three.module.js')) {
            return 'three-sketchbook'
          }
        },
      },
    },
    // Gzip-aware budgets are enforced by scripts/check-bundle-budget.mjs.
    chunkSizeWarningLimit: 1100,
  },
})
