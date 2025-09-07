import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  envDir: '../../', // .envファイルの場所を指定
  envPrefix: 'VITE_', // 環境変数のプレフィックスを明示的に指定
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/renderer': resolve(__dirname, 'src/renderer'),
      '@/main': resolve(__dirname, 'src/main')
    }
  },
  server: {
    port: 3000
  }
})