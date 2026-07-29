import { defineConfig, type Connect } from 'vite'
import react from '@vitejs/plugin-react'

// Vite's dev/preview servers do no directory-index resolution for public/, so
// the SPA fallback swallows the static case-study URLs (/projects/<name>/) and
// serves the portfolio instead. Rewrite extensionless /projects paths to their
// index.html. Vercel resolves these natively in production — dev-only shim.
const projectsIndexRewrite: Connect.NextHandleFunction = (req, _res, next) => {
  const url = (req.url ?? '').split('?')[0]
  if ((url === '/projects' || url.startsWith('/projects/')) && !/\.[a-z0-9]+$/i.test(url)) {
    req.url = url.replace(/\/?$/, '/') + 'index.html'
  }
  next()
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'public-directory-indexes',
      configureServer(server) {
        server.middlewares.use(projectsIndexRewrite)
      },
      configurePreviewServer(server) {
        server.middlewares.use(projectsIndexRewrite)
      },
    },
  ],
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
