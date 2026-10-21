# Morrow House

A premium home-and-living storefront built with React, Vite, Framer Motion, and Stripe Checkout.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and set `STRIPE_SECRET_KEY` to a **test-mode** secret key from [Stripe API keys](https://dashboard.stripe.com/test/apikeys).
3. Run `npm run dev` and open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The development command starts the Vite site and the Express API. The API health check is available at `http://127.0.0.1:4242/api/health`.

## Run the production storefront

Build the frontend with `npm run build`, then start the Express server with `NODE_ENV=production npm start`. The server listens on `PORT` (default `4242`), serves the built storefront, and handles `/api/*` requests. Set server-side environment variables (`APP_URL`, `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optional `OPENAI_API_KEY`) in the host's secret manager. Never add `.env` to Git.

Use a Node.js host that can run the Express server continuously. A static-only host cannot serve the API or checkout routes. The private admin app remains local and loopback-only; do not expose it publicly.

## Private admin dashboard

The admin dashboard is a separate Vite app under `admin/`; it is not part of the public storefront build and has no link or route on the customer website. Configure `ADMIN_PASSWORD` in the ignored `.env` file with a unique passphrase of at least 16 characters, then run `npm run admin` in a terminal. Open `http://127.0.0.1:4174`. Both the admin app and its API bind to loopback only. The dashboard requires its password on every browser session.

Until Supabase is configured, the admin dashboard shows clearly labeled preview data. Inventory edits and order status changes are held in memory and reset when the admin API restarts. See [admin/README.md](admin/README.md) for Supabase setup, ownership policies, and secure Stripe order syncing.

## CJdropshipping / supplier integration

CJdropshipping is configured as a server-side supplier integration only. The storefront never calls CJ directly. Add all CJ values to the ignored local `.env` file using the variables in `.env.example`; they stay on the Express backend and are never exposed to the browser.

Required environment variables:
- `CJ_API_BASE_URL`
- `CJ_ACCESS_TOKEN`
- `CJ_API_KEY`
- `CJ_API_SECRET`

Use the current official CJ API documentation to confirm which authentication fields your account actually requires and which endpoints accept which payloads. The service abstraction in `services/cj/index.js` centralizes these calls and keeps the API contract isolated from the frontend.

For the internal sync layer, add the supplier schema from [services/cj/schema.sql](services/cj/schema.sql) in Supabase. It creates the `public.cj_products` table for imported supplier catalog entries and the `public.sync_logs` table for import success/error history, keeping supplier metadata separate from the storefront's own product table.

## Payments

Checkout redirects to Stripe-hosted Checkout. Stripe securely collects payment details and enables the payment methods active for the account in Stripe Dashboard. Product IDs, names, prices, shipping costs, and quantities are validated server-side; client-submitted prices are never used.

The demo accepts shipping addresses in the United States and Canada. Ground shipping is $15, with complimentary shipping on orders of $150 or more. Applicable taxes and delivery are shown by Stripe before payment. Adjust the shipping values and product catalog in `server.js` before launch.

Use Stripe's [test cards](https://docs.stripe.com/testing#cards) while the secret key starts with `sk_test_`. Test payment success with `4242 4242 4242 4242`, any future expiration date, and any CVC. Never put a secret key in frontend code or commit `.env`.

The success page verifies the Checkout Session with Stripe before clearing the local bag. Before production launch, configure a production secret key and `APP_URL`, and add a signed Stripe webhook plus durable order storage for reliable order fulfillment.

## Design Enthusiast

The storefront's Design Enthusiast answers questions using the catalog guide by default. To enable live AI replies, set `OPENAI_API_KEY` in `.env`; `OPENAI_MODEL` can optionally select a compatible model. The key stays server-side, questions are limited to 600 characters and 12 requests per minute per IP, and live-mode questions are sent to OpenAI. The assistant is instructed to use known product and shipping details and call out missing information rather than invent it.

## Scripts

- `npm run dev` starts the Vite development server and checkout API.
- `npm run build` creates the production frontend build.
- `npm run lint` runs Oxlint.
- `npm start` starts the Express server; set `NODE_ENV=production` to serve the built frontend as well.
