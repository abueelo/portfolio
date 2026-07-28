# Setup

`/edit` is the console — GitHub SSO, locked to `abueelo` (see `OWNER` in `functions/_lib.js`).

## 1. GitHub OAuth app

Make two OAuth apps under GitHub → Settings → Developer settings → OAuth Apps, one for dev and one for prod:

- dev: homepage `http://localhost:8788`, callback `http://localhost:8788/api/callback`
- prod: homepage `https://russl.dev`, callback `https://russl.dev/api/callback`

Generate a client secret for each and keep the client id + secret.

## 2. Local dev

```sh
cp .dev.vars.example .dev.vars
```

Fill in `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (dev app) and `SESSION_SECRET` (`openssl rand -hex 32`), then:

```sh
npx wrangler pages dev . --kv PORTFOLIO_KV --r2 PHOTOS
```

Site's at http://localhost:8788, console at `/edit`. Local KV data lives under `.wrangler/` (gitignored).

## 3. Deploy

Deploys go through GitHub Actions (`.github/workflows/deploy.yml`) on push to `main` — no build step. Don't use the Pages dashboard's "Connect to Git", it sets up a competing pipeline.

1. `npx wrangler login`, then `npx wrangler pages project create portfolio --production-branch=main`
2. KV: create a namespace called `portfolio`, bind it as `PORTFOLIO_KV` in the Pages project's settings.
3. R2: create a bucket called `portfolio-photos`, bind it as `PHOTOS`.
4. Add Pages env vars (Production, marked secret): `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (prod app), `SESSION_SECRET`, and optionally `GITHUB_API_TOKEN` (no scopes needed, just raises the GitHub API rate limit for `/api/repos` from 60/hr to 5000/hr).
5. Grab a Cloudflare API token (Edit Cloudflare Workers template, or a custom one scoped to Pages) and your account id (right sidebar of the dashboard).
6. Add both as repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
7. Add custom domains `russl.dev` and `photography.russl.dev` to the Pages project — middleware serves the gallery at that subdomain's root.
8. Leave Bot Fight Mode / Under Attack Mode off, they trigger a browser-check page.
9. Push to `main`, or just re-run the workflow.
