# Shamaadan E-Store

Unified retail management system — one codebase, two domain-driven application layers:

| Domain | Layer | Purpose |
|--------|-------|---------|
| `store.com` | **Storefront** | Public e-commerce shop |
| `admin.store.com` / `pos.store.com` | **POS & Admin** | iPad touch POS + financial dashboard |

Built with **Vanilla JS**, **Supabase**, deployed on **Vercel**. No UI frameworks.

---

## Directory Structure

```
├── api/
│   ├── env.js          # Injects Supabase credentials at runtime
│   └── gateway.js      # Hostname-aware routing metadata (health / edge hints)
├── css/
│   ├── base.css        # Shared reset, tokens, boot screen
│   ├── storefront.css  # Public shop styles
│   └── pos.css         # Loyverse-style POS layout
├── js/
│   ├── router.js       # Domain router — boot entry point
│   ├── config/
│   │   ├── domains.js  # Hostname → app layer mapping
│   │   └── supabase.js # Shared Supabase singleton
│   ├── shared/
│   │   ├── format.js
│   │   └── mock-products.js
│   ├── storefront/
│   │   └── app.js      # Storefront mount + product grid
│   └── pos/
│       ├── app.js      # POS shell + event wiring
│       ├── cart-state.js   # Active ticket state machine
│       └── dashboard.js      # Online vs In-Store metrics
├── index.html          # Single HTML entry for both domains
├── vercel.json         # SPA rewrites + cache headers
└── package.json
```

---

## How Routing Works

1. **`index.html`** loads `/api/env.js` (Supabase keys) then **`js/router.js`**.
2. **`router.js`** reads `window.location.hostname` and calls **`resolveAppLayer()`** in `js/config/domains.js`.
3. The matching app module is **dynamically imported** — only one layer's JS/CSS loads per visit.
4. **`api/gateway.js`** mirrors the same hostname logic server-side for health checks and future edge redirects.

### Local Testing (no DNS setup)

Use query-param overrides:

- Storefront: `http://localhost:3000/?app=storefront`
- POS: `http://localhost:3000/?app=pos`

---

## Quick Start

```bash
npm install
npm run dev
# → http://localhost:3000/?app=storefront
# → http://localhost:3000/?app=pos
```

---

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in [Vercel](https://vercel.com/new).
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `STOREFRONT_HOST` (optional, default `store.com`)
   - `ADMIN_HOST` (optional, default `admin.store.com`)
   - `POS_HOST` (optional, default `pos.store.com`)
4. Add custom domains in Vercel → **Settings → Domains**:
   - `store.com` → production
   - `admin.store.com` or `pos.store.com` → same deployment
5. Deploy. Both domains serve `index.html`; the client router picks the correct layer.

---

## Supabase Setup (optional for scaffold)

The apps run in **demo mode** with mock products when credentials are missing.

When ready, create a `products` table:

```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  sku text unique not null,
  name text not null,
  category text,
  price numeric(10,2) not null,
  cost numeric(10,2) default 0,
  stock integer default 0,
  active boolean default true,
  created_at timestamptz default now()
);
```

Enable Row Level Security and add policies appropriate for your auth model.

---

## POS Features (scaffold)

- **Two-column Loyverse layout**: product grid (left) + live ticket (right)
- **Tap-to-add** with dynamic totals (subtotal, cost, gross profit)
- **Stock mutation**: inventory decrements on add, restores on clear/remove
- **Low-stock / out-of-stock** visual states on product cards
- **Financial dashboard**: side-by-side Online vs In-Store metrics (Sell count, Gross Revenue, Product Cost, Net Profit)
- **Charge** button records in-store sales to the dashboard

---

## Performance Notes

- Zero framework bundle — only the active app layer loads
- CSS split per layer; long-cache headers on static assets via `vercel.json`
- Supabase client loaded from `esm.sh` on demand inside `supabase.js`
- System font stack — no webfont blocking render

---

## License

Proprietary — Shamaadan
