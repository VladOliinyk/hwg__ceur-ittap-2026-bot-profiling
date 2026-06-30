import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    },
    // Match Vue CLI / Webpack default: import paths can omit the `.vue`
    // extension. Without `.vue` in the extension list vite cannot
    // resolve imports like `from '../components/HeaderComponent'`.
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.vue']
  },
  test: {
    // happy-dom is enabled per-file via `// @vitest-environment happy-dom`
    // to keep the bulk of utility tests running in the (faster) node env.
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.js'],
    setupFiles: ['src/test/i18nMock.js'],
    // Several .vue components import assets (svg, json, lottie data) via
    // webpack's `require('@/assets/...')`. Vitest doesn't evaluate those
    // dependencies for component-level tests; the stubs in
    // `Playground.dispatch.test.js` substitute the children that
    // need them. For tests that import a heavy `.vue` directly, treat
    // unresolved CSS / asset imports as inert.
    server: {
      deps: {
        inline: ['vue3-lottie']
      }
    }
  }
})
