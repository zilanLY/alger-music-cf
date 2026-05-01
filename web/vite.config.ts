import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import { NaiveUiResolver } from 'unplugin-vue-components/resolvers'
import Components from 'unplugin-vue-components/vite'
import { defineConfig } from 'vite'

const projectRoot = __dirname
const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  base: './',
  root: resolve(projectRoot, 'src'),
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
      '@renderer': resolve(projectRoot, 'src'),
      '@i18n': resolve(projectRoot, 'src/i18n')
    }
  },
  plugins: [
    vue(),
    tailwindcss(),

    AutoImport({
      imports: [
        'vue',
        {
          'naive-ui': ['useDialog', 'useMessage', 'useNotification', 'useLoadingBar']
        }
      ],
      dts: isDev ? './auto-imports.d.ts' : false
    }),

    Components({
      resolvers: [NaiveUiResolver()],
      dts: isDev ? './components.d.ts' : false
    })
  ],

  build: {
    target: 'esnext',
    outDir: resolve(projectRoot, '../dist'),
    emptyOutDir: true,
    cssMinify: 'lightningcss',
    cssCodeSplit: false,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/naive-ui')) return 'naive-ui'
          if (id.includes('node_modules/vue')) return 'vue-vendor'
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  },

  css: {
    transformer: 'lightningcss',
    lightningcss: {
      drafts: { nesting: true }
    }
  },

  publicDir: resolve(projectRoot, 'resources'),
  server: {
    host: '0.0.0.0',
    port: 2389,
    proxy: {
      '/api': {
        target: process.env.VITE_API || 'http://localhost:30488',
        changeOrigin: true,
        rewrite: (path) => path
      }
    }
  }
})