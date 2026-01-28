import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'build',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('react')) {
            return 'react';
          }
          if (id.includes('@mui')) {
            return 'mui';
          }
          if (id.includes('@emotion')) {
            return 'emotion';
          }
          if (id.includes('chart.js')) {
            return 'chartjs';
          }
          if (id.includes('recharts')) {
            return 'recharts';
          }
          if (id.includes('react-gauge-chart')) {
            return 'gauge';
          }
          return 'vendor';
        },
      },
    },
  },
  server: {
    // Proxy API calls to the backend (matches CRA proxy behavior for /api)
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5001',
        changeOrigin: true,
      },
    },
  },
});
