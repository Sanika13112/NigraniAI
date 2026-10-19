import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development every API call goes to /api on the Vite server and is proxied to the
// Spring Cloud Gateway, so the browser sees one origin (no CORS, and the HttpOnly refresh
// cookie works). In production serve the built app and proxy /api the same way (see README).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const gateway = env.SHOPSMART_GATEWAY_URL || 'http://localhost:8080';
  // Public tunnel addresses used by share-online.bat (Cloudflare quick tunnel) or ngrok.
  const allowedHosts = ['localhost', '.trycloudflare.com', '.ngrok-free.app'];
  return {
    plugins: [react()],
    server: {
      port: 5173,
      allowedHosts,
      proxy: {
        '/api': {
          target: gateway,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    preview: {
      port: 4173,
      allowedHosts,
      proxy: {
        '/api': {
          target: gateway,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 700 },
  };
});
