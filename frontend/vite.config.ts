import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production' || process.env.NODE_ENV === 'production';
  const allowMockCamera = (env.VITE_ALLOW_MOCK_CAMERA || process.env.VITE_ALLOW_MOCK_CAMERA) === 'true';

  if (isProd && allowMockCamera) {
    throw new Error(
      '[SECURITY ERROR] VITE_ALLOW_MOCK_CAMERA=true is strictly forbidden in production builds. Production builds must only use physical camera devices.'
    );
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    esbuild: {
      drop: isProd ? ['debugger'] : [],
      pure: isProd ? ['console.log', 'console.debug', 'console.info'] : [],
    },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 1400,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/');
            if (normalizedId.includes('node_modules')) {
              if (
                normalizedId.includes('@react-pdf') ||
                normalizedId.includes('pdfkit') ||
                normalizedId.includes('fontkit') ||
                normalizedId.includes('png-js') ||
                normalizedId.includes('restructure')
              ) {
                return 'vendor-pdf';
              }
              if (normalizedId.includes('@mediapipe')) {
                return 'vendor-mediapipe';
              }
              if (normalizedId.includes('lucide-react')) {
                return 'vendor-icons';
              }
              if (
                normalizedId.includes('/react/') ||
                normalizedId.includes('/react-dom/') ||
                normalizedId.includes('/react-router/') ||
                normalizedId.includes('/react-router-dom/') ||
                normalizedId.includes('/scheduler/')
              ) {
                return 'vendor-react';
              }
            }
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
          ws: true,
        },
        '/health': {
          target: 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    test: {
      globals: true,
      environment: 'node',
      include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'tests/**/test_*.tsx', 'tests/**/test_*.ts'],
    },
  };
});

