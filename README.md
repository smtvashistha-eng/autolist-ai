# AutoList AI

AI-powered e-commerce listing automation for marketplace sellers — turn product data (and your own
marketplace sample file) into **reviewed, upload-ready listings** for Amazon, Flipkart, Meesho and Shopify.
Includes a free public **PDF Cropper** tool.

Runs with **zero external services** today (Node's built-in SQLite + crypto), designed to migrate cleanly to
Postgres / Redis / S3 when you deploy at scale.

## Requirements
- **Node.js 22+** (uses the built-in `node:sqlite`, run with `--experimental-sqlite`).

## Run
```bash
npm install
cp .env.example .env      # set SESSION_SECRET at minimum
npm start                 # http://localhost:3000
```
Open the site → **Get started free** → dashboard. The PDF Cropper is at `/tools/crop-pdf` (no signup).

## Test
```bash
npm test                  # 105 backend tests across phases 1–6
```

## What's built
**Web app (server-rendered):** landing page, auth, dashboard, guided Create Listing, bulk upload,
drafts, image studio, marketplace templates, exports, marketplace connections, billing, help,
and a free in-browser PDF Cropper.

**JSON REST backend (`/api`, phases 1–6):**
1. Auth, users, businesses, multi-tenant isolation, migrations, env validation
2. Products CRUD, private file storage + signed URLs, drafts, idempotent autosave
3. AI provider interface, listing generation, strict output validation, AI-request logging
4. Image provider, editing, non-destructive versioning
5. DB-backed job queue + worker, bulk jobs, live progress (SSE + polling), retry/cancel
6. Template analysis, mapping engine, validation engine, marketplace export engine

Safety by design: **factual fields are never invented** (flagged for confirmation), payment status is
verified server-side, files are private with expiring signed URLs, and every business is isolated.

## Structure
```
src/            server, auth, db, migrations, env
src/api/        REST modules (auth, users, businesses, products, files, drafts, ai, images, jobs, templates, exports)
src/ai/         text + image providers, output schema
src/marketplace/ file-based marketplace providers
public/         app.css, cropper.js, static assets
test/           phase1–6 API/integration tests
data/           SQLite DB + private files (gitignored — never committed)
```

## Stack
- **Web/API:** Node.js + Express (no build step)
- **DB:** built-in `node:sqlite` with tracked migrations (`src/migrate.js`) — same SQL shape as Postgres
- **Auth:** scrypt hashing + HMAC-signed cookie sessions; email-verify + password-reset tokens
- **Jobs:** in-process DB-backed queue (BullMQ-swappable)
- **Storage:** local private store + HMAC signed URLs (S3-swappable)
- **AI:** provider abstraction with deterministic, fact-safe fallbacks (no key required to run)

## Configuration
See [`.env.example`](.env.example). Only `SESSION_SECRET` is required to run; everything else
(AI keys, Razorpay, SMTP, image generation) is optional and gated.

## Roadmap
- Backend Phase 7 — usage metering + Razorpay subscriptions + verified webhooks
- Backend Phase 8 — marketplace connections, admin APIs, monitoring, security hardening

## Deployment notes
Needs a **Node 22+ runtime with a persistent disk** for `data/` (SQLite + uploaded files) — a VPS or a
Node-capable host, not classic PHP shared hosting. Set env vars from `.env.example`, put it behind HTTPS,
and set `PUBLIC_URL` to your domain.
