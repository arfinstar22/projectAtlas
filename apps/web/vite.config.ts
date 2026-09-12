import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '');
  const serverPort = Number(env.PORT) || 3000;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@atlas/core': path.resolve(__dirname, '../../packages/core/src')
      }
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://localhost:${serverPort}`,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  };
});