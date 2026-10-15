# RepoIQ frontend

This repository contains the frontend for the RepoIQ application (Vite + React + TypeScript).

## Running locally

Requirements: Node.js and npm (or pnpm/yarn).

```sh
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>
npm install
npm run dev
```

## Technologies

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## Deployment

Build for production:

```sh
VITE_API_BASE_URL=https://api.example.com/api/v1 npm run build
PORT=4173 VITE_API_BASE_URL=https://api.example.com/api/v1 npm start
```

`npm start` runs `server.js`, a dependency-free static server for `dist/`
(SPA fallback, long-lived caching for hashed assets, security headers and a
CSP that allows the API origin). `npm run preview` is for local checks only.
Requires Node 20+.
