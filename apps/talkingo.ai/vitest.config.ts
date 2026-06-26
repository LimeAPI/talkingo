import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // `server-only` is a Next.js build-time marker with no resolvable module
      // under Vite/jsdom; stub it so server modules can load in unit tests.
      { find: 'server-only', replacement: path.resolve(__dirname, './src/__tests__/stubs/server-only.ts') },
      { find: '@/', replacement: path.resolve(__dirname, './src') + '/' },
      { find: '@talkingo/shared/gemini/personas', replacement: path.resolve(__dirname, './src/shared/gemini/personas.ts') },
      { find: '@talkingo/shared/gemini/master-prompt', replacement: path.resolve(__dirname, './src/shared/gemini/master-prompt.ts') },
      { find: '@talkingo/shared/gemini', replacement: path.resolve(__dirname, './src/shared/gemini/index.ts') },
      { find: '@talkingo/shared/types', replacement: path.resolve(__dirname, './src/shared/types/index.ts') },
      { find: '@talkingo/shared/utils', replacement: path.resolve(__dirname, './src/shared/utils/index.ts') },
      { find: '@talkingo/shared/curriculum', replacement: path.resolve(__dirname, './src/shared/curriculum/index.ts') },
      { find: '@talkingo/shared/languages', replacement: path.resolve(__dirname, './src/shared/languages/index.ts') },
      { find: '@talkingo/shared/levels', replacement: path.resolve(__dirname, './src/shared/levels/index.ts') },
      { find: '@talkingo/shared', replacement: path.resolve(__dirname, './src/shared/index.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
})
