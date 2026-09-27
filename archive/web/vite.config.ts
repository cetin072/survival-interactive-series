import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith('/src/archive/archiveData.ts')) return 'archive-graph'
          if (id.endsWith('/src/archive/characterAppearance.ts')) return 'archive-characters'
        },
      },
    },
  },
})
