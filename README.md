# Teamtailor CSV Exporter

Node.js + TypeScript web app that exports candidates from Teamtailor to CSV.

## Setup

1. `npm install` — install dependencies
2. Edit `.env` — set your `TEAMTAILOR_API_KEY`
3. `npm run build` — compile TypeScript to JavaScript
4. `npm start` — start the server
5. Open http://localhost:3000

## Development

Use `npm run dev` to build and run with auto-restart on file changes.

Use `npm run watch` to continuously compile TypeScript without restarting the server.

## Architecture

Browser → Express Server (TypeScript/Node.js) → Teamtailor API → CSV file download

## Key Decisions

- **TypeScript** — Full type safety with strict mode enabled
- **include=job-applications** — JSON:API side-loading (no N+1)
- **Pagination** via `links.next` — Iterates through all pages
- **Retry with exponential backoff** — Handles 429 rate limiting
- **Map for O(1) lookups** — Efficient job-application matching
- **RFC 4180 CSV** with BOM — Proper Excel UTF-8 handling