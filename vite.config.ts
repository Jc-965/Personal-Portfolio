import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
