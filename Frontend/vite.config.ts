import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Better handling of server restarts
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // Prevent 504 errors on restart
    strictPort: false,
    cors: true,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Production-ready build optimizations
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: mode === 'production', // Remove console logs in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        // Manual chunking for better caching.
        //
        // The previous config also listed a 'utils' chunk containing
        // '@/lib/utils' and '@/lib/api'. manualChunks matches resolved module
        // ids, not Vite path aliases, so those entries never matched anything
        // and the chunk was silently never produced. Dropped rather than
        // rewritten as absolute paths: app code is better split by route (which
        // the lazy() imports in App.tsx already do) than pinned into one chunk
        // that every route has to download.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'lucide-react'],
          'chart-vendor': ['recharts'],
        },
      },
    },
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    // Source maps for production debugging (remove for production if not needed)
    sourcemap: mode !== 'production',
  },
  // Performance optimizations
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom'],
  },
}));
