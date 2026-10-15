import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Production-ready console handling. Our own console.log/info/debug calls are
// already stripped at build time (terser pure_funcs in vite.config.ts); this
// also silences the debug chatter of third-party code.
if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  
  // Keep warnings and errors for monitoring
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args: unknown[]) => {
    // Filter out React Router future flag warnings
    const message = args[0]?.toString() || '';
    if (message.includes('React Router Future Flag Warning')) {
      return; // Suppress in production
    }
    originalWarn.apply(console, args);
  };
  
  console.error = (...args: unknown[]) => {
    // Keep all errors for monitoring
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
