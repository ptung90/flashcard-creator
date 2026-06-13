import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

function htmlInclude() {
  return {
    name: 'html-include',
    transformIndexHtml(html) {
      return html.replace(/<!--\s*#include\s+([^\s>]+)\s*-->/g, (_, src) => {
        const abs = resolve(__dirname, src)
        return readFileSync(abs, 'utf8')
      })
    },
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [htmlInclude(), viteSingleFile()],
  build: {
    outDir: 'dist',
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
