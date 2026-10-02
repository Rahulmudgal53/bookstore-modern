# Bookstore

A React/Vite bookstore with a PostgreSQL-backed Express API, role-based access, and a Docker deployment path. Checkout is intentionally **test-only**: orders update inventory and are recorded, but no payment is collected.

## Local development

Requirements: Node.js 22.12+ and Docker Compose (or another PostgreSQL 15+ server).

1. Copy `.env.example` to `.env`. Replace `JWT_SECRET` with a unique secret, for example:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Start the local database and install dependencies:

   ```sh
   docker compose up -d postgres
   npm install
   ```

3. Start both the API and Vite:

   ```sh
   npm run dev
   ```

Vite runs on port 5173 (or the next available port); the API runs on port 4000. The API applies the schema and starter catalog at startup. Alternatively, run `npm run db:setup` to initialize the database separately.

Set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_MANAGER_EMAIL`, and `BOOTSTRAP_MANAGER_PASSWORD` in `.env` before setup to create staff accounts. Bootstrap passwords must be at least 14 characters. Public registration only creates customer accounts. Never use example/default passwords on a public deployment.

## Importing the existing JSON store

If `server/data/store.json` exists, start a **fresh** database with bootstrap email/password variables left blank, then run:

```sh
npm run db:setup
npm run db:import-json
```

The import is transactional and refuses to run if the target already has users or orders. It preserves account hashes, book inventory, eligible users' wishlists, orders, and reviews. Known demo/test accounts (`demo@bookstore.com`, `manager@bookstore.com`, `admin@bookstore.com`, and `testrole@example.com`) and their associated orders/reviews are deliberately excluded; provision new staff accounts using the bootstrap settings above. Keep a backup of the JSON file until the imported data is verified.

After the import succeeds, add the bootstrap staff settings to `.env` and run `npm run db:setup` again to create fresh staff accounts.

## Docker deployment

Set a strong `JWT_SECRET` and production staff bootstrap credentials in `.env`, then build and start the full stack:

```sh
docker compose up --build
```

The app is available on port 4000 and serves both the built UI and API. PostgreSQL data is stored in the `bookstore-postgres` Docker volume. Change the local Compose database password before exposing any service publicly. For a managed PostgreSQL provider, set `DATABASE_URL` and `DATABASE_SSL=true` as required by the provider, allow only trusted origins in `CORS_ORIGINS`, and deploy the app container or build/run with `npm run build` and `npm start`.

Set `TRUST_PROXY=true` only when the app is behind a trusted proxy that sets forwarded headers. Keep `.env` private. Payment mode is locked to `test`; changing `PAYMENT_MODE` to another value intentionally prevents the API from starting until a real payment integration is implemented.

## Render deployment

The root `render.yaml` defines a **Free** Node web service only; it does not create a database or add credentials. In the Render Dashboard, create a PostgreSQL database first, review its plan, region, storage, backup, and retention terms, then create a Blueprint for this repository. Use a database in the same region and provide its internal connection string as `DATABASE_URL` when prompted. The Blueprint generates `JWT_SECRET` in Render and prompts for the initial admin email and password; use a unique password of at least 14 characters. No secret values belong in this repository.

The app defaults to `DATABASE_SSL=false` for Render's internal database connection. If you use an external provider, configure SSL as that provider requires. Verify `CORS_ORIGINS` matches the web service's actual HTTPS URL in the dashboard, especially if Render assigns a different hostname. The Free web service spins down when idle and can take about a minute to start again; it is intended for evaluation, not production. Render's Free Postgres databases expire after 30 days and are deleted after a further 14-day grace period, so do not use one for data you need to retain. Choose any paid capacity yourself in the dashboard only after reviewing its cost and data-retention terms.

## Role capabilities

- **Customer:** browse/search/filter books; manage a persistent wishlist and profile; write or update reviews; place test orders; view order history and cancel eligible orders.
- **Manager:** customer-facing access plus catalog/inventory management, review moderation, and order fulfillment.
- **Admin:** manager capabilities plus store metrics and user role/access management, with guardrails that prevent removing the last active administrator.

## API

- Public: `GET /api/health`, `GET /api/books`, `GET /api/reviews`, `POST /api/auth/register`, `POST /api/auth/login`
- Signed-in user: `GET /api/auth/me`, `GET /api/profile`, `PATCH /api/profile`, `GET /api/me/wishlist`, `PUT /api/me/wishlist/:bookId`, `GET /api/orders`, `POST /api/orders`, `PATCH /api/orders/:orderId/cancel`, `POST /api/reviews`
- Manager/admin: `GET /api/manager/orders`, `POST /api/manager/books`, `PATCH /api/manager/books/:bookId`, `DELETE /api/manager/books/:bookId`, `DELETE /api/reviews/:reviewId`, `PATCH /api/manager/orders/:orderId/status`
- Admin only: `GET /api/admin/stats`, `GET /api/admin/users`, `PATCH /api/admin/users/:userId`

Run `npm run build` and `npm run lint` for frontend/build checks. `GET /api/health` also verifies the database connection.

## API tests

Run `npm run db:setup` against a dedicated PostgreSQL database, then `npm test`. The integration tests create and clean up uniquely named test users, books, and orders; do not point them at production data.
