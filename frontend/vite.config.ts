import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative base so the built assets work whether the site is served from
  // a GitHub Pages project path (https://user.github.io/repo/), a user/org
  // page, or a custom domain.
  base: './',
})
