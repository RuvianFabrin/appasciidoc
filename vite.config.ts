import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Porta fixa: o Tauri aponta o devUrl para ela em tauri.conf.json.
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // O Tauri controla o console; nao limpar a tela do Vite.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: {
      // src-tauri e compilado pelo cargo, nao pelo Vite.
      ignored: ['**/src-tauri/**'],
    },
  },
  // Somente variaveis com estes prefixos vao para o frontend.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    // Alvo compativel com os webviews do Tauri (WebView2 / WebKitGTK).
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
  },
});
