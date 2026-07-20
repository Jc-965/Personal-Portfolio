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
      },
    },
    // Gzip-aware budgets are enforced by scripts/check-bundle-budget.mjs.
    chunkSizeWarningLimit: 1100,
  },
})
