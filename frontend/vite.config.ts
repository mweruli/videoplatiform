import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // Docker Desktop on Windows doesn't forward inotify events across the
    // bind-mounted ./frontend volume (see docker-compose.yml), so chokidar's
    // default watcher silently misses file changes and HMR/full-reload never
    // fires. Polling is slightly heavier but makes local dev against the
    // dockerized frontend actually reflect edits.
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
})
