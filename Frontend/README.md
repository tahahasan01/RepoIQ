# RepoIQ frontend

React + Vite + TypeScript single-page app for RepoIQ. Setup and deployment are
documented in the [root README](../README.md).

```bash
npm install
cp .env.example .env      # VITE_API_BASE_URL=http://localhost:8000/api/v1
npm run dev               # http://localhost:8080
npm run typecheck && npx vitest run && npm run lint && npm run build
npm start                 # serve the production build (server.js), reads PORT
```
