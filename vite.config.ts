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
    // Don't eagerly <link rel=modulepreload> chunks that aren't needed for the
    // initial above-the-fold paint. These are all loaded via dynamic import()
    // when actually reached, so preloading them at high priority only steals
    // bandwidth from the truly-critical assets (entry JS, CSS, fonts):
    //   - vendor-3d (201KB gz): only the decorative Dither backdrop + hero ASCII
    //   - firebase  (50KB gz):  only the Constellation section (scroll)
    //   - sketchbook(32KB gz):  only the Sketchbook overlay (click)
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter(
          (dep) =>
            !dep.includes('vendor-3d') &&
            !dep.includes('firebase') &&
            !dep.includes('sketchbook')
        ),
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('firebase')) return 'firebase'
          if (
            id.includes('node_modules/three') ||
            id.includes('node_modules/@react-three') ||
            id.includes('node_modules/postprocessing')
          ) {
            return 'vendor-3d'
          }
          if (id.includes('node_modules/gsap')) return 'vendor-gsap'
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react'
          if (id.includes('node_modules/framer-motion')) return 'vendor-motion'
          if (id.includes('node_modules/lucide-react')) return 'vendor-lucide'
          if (id.includes('SketchbookTerrain')) return 'sketchbook'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    chunkSizeWarningLimit: 600,
  },
})
