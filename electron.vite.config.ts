import { resolve } from 'path'
import { readFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin } from 'vite'

const materialIconsDir = resolve('node_modules/material-icon-theme/icons')

function materialFileIconsPlugin(): Plugin {
  return {
    name: 'material-file-icons',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.startsWith('/file-icons/')) {
          const fileName = req.url.replace('/file-icons/', '')
          const filePath = resolve(materialIconsDir, fileName)
          try {
            const svg = readFileSync(filePath)
            res.setHeader('Content-Type', 'image/svg+xml')
            res.setHeader('Cache-Control', 'public, max-age=31536000')
            res.end(svg)
          } catch {
            next()
          }
          return
        }
        next()
      })
    },
    writeBundle(options) {
      const outDir = options.dir || 'out/renderer'
      const destDir = resolve(outDir, 'file-icons')
      if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })
      for (const file of readdirSync(materialIconsDir)) {
        if (file.endsWith('.svg')) {
          copyFileSync(resolve(materialIconsDir, file), resolve(destDir, file))
        }
      }
    }
  }
}

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: true
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), materialFileIconsPlugin()]
  }
})
