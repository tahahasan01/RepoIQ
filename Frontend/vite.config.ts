import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// node_modules package paths per vendor chunk (see build.rollupOptions).
const pkg = (names: string) => new RegExp(`[\\\\/]node_modules[\\\\/](?:${names})[\\\\/]`);
const REACT_PACKAGES = pkg('react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\\\/]router');
const CORE_PACKAGES = pkg('clsx');
const UI_PACKAGES =pkg('framer-motion|motion-dom|motion-utils|lucide-react');
// recharts and the packages only it uses.
const CHART_PACKAGES = pkg(
  'recharts|recharts-scale|react-smooth|victory-vendor|d3-[^\\\\/]+|internmap|decimal\\.js-light|lodash|eventemitter3|fast-equals'
);

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
        //
        // A function, not the { chunk: [packages] } object form. The object
        // form puts each listed package's whole dependency graph in its chunk,
        // so small helpers recharts depends on (clsx, which `cn()` uses on
        // every page) landed in chart-vendor - and the entry then had to
        // import, and index.html preload, 400 kB of charting code on the
        // landing and login pages. Matching package paths keeps each vendor
        // chunk to the packages named here; shared helpers go wherever Rollup
        // puts them, next to their real importers.
        //
        // Rollup also moves an unassigned dependency of a manual chunk INTO
        // that chunk, so the small modules every page needs are pinned to the
        // always-loaded react-vendor chunk rather than left for chart-vendor to
        // claim: clsx, and Rollup's own CommonJS interop helper.
        manualChunks(id) {
          if (id.includes('commonjsHelpers')) return 'react-vendor';
          if (!id.includes('node_modules')) return undefined;
          if (CHART_PACKAGES.test(id)) return 'chart-vendor';
          if (REACT_PACKAGES.test(id) || CORE_PACKAGES.test(id)) return 'react-vendor';
          if (UI_PACKAGES.test(id)) return 'ui-vendor';
          return undefined;
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
