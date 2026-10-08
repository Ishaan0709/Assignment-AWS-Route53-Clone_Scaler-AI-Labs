# Frontend

Next.js 15 (App Router, TypeScript strict) frontend for the Route 53 console clone, built with the
Cloudscape Design System and TanStack Query.

See the [root README](../README.md) for the full setup, architecture and API documentation.

## Scripts

| Command                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| `npm run dev`          | Start the dev server on `localhost:3000` |
| `npm run build`        | Production build                         |
| `npm run start`        | Serve the production build               |
| `npm run lint`         | ESLint                                   |
| `npm run typecheck`    | `tsc --noEmit`                           |
| `npm run test`         | Vitest unit tests                        |
| `npm run format:check` | Prettier check (`npm run format` to fix) |

The dev server proxies `/api/*` to the backend at `API_URL` (default `http://localhost:8000`), see
`next.config.mjs` and `.env.example`.
