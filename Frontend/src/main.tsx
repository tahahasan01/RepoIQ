import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Production-ready console handling
if (import.meta.env.PROD) {
  // Suppress all console logs in production
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  
  // Keep warnings and errors for monitoring
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args: any[]) => {
    // Filter out React Router future flag warnings
    const message = args[0]?.toString() || '';
    if (message.includes('React Router Future Flag Warning')) {
      return; // Suppress in production
    }
    originalWarn.apply(console, args);
  };
  
  console.error = (...args: any[]) => {
    // Keep all errors for monitoring
    originalError.apply(console, args);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
