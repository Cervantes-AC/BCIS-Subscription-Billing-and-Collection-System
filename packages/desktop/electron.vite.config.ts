import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const apiOrigin = new URL(process.env.VITE_API_URL || 'http://localhost:3000/api/v1').origin;

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __BCIS_API_ORIGIN__: JSON.stringify(apiOrigin),
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@bcis/shared': resolve(__dirname, '../shared/src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@bcis/shared': resolve(__dirname, '../shared/src'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
        },
      },
    },
  },

  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@bcis/shared': resolve(__dirname, '../shared/src'),
      },
    },
    root: resolve(__dirname, 'src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
  },
});
