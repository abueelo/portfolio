# Setup

`/edit` — GitHub SSO console, access restricted to `abueelo` (`OWNER` in `functions/_lib.js`).

## 1. GitHub OAuth app (dev + prod)

GitHub → Settings → Developer settings → OAuth Apps → New OAuth App:

| field | dev | prod |
|---|---|---|
| Application name | `portfolio (dev)` | `portfolio` |
| Homepage URL | `http://localhost:8788` | `https://russl.dev` |
| Callback URL | `http://localhost:8788/api/callback` | `https://russl.dev/api/callback` |

Generate a client secret, keep client id + secret.

## 2. Local dev

```sh
cp .dev.vars.example .dev.vars
#   GITHUB_CLIENT_ID     = dev app client id
#   GITHUB_CLIENT_SECRET = dev app client secret
#   SESSION_SECRET       = openssl rand -hex 32

npx wrangler pages dev . --kv PORTFOLIO_KV --r2 PHOTOS
```

http://localhost:8788 — site. `/edit` — console. Local KV data under `.wrangler/` (gitignored).

## 3. Deploy

GitHub Actions (`.github/workflows/deploy.yml`) deploys on push to `main`. No build step. Don't use the dashboard's "Connect to Git" — creates a competing pipeline.

1. Create the Pages project:
   ```sh
   npx wrangler login
   npx wrangler pages project create portfolio --production-branch=main
   ```
2. KV: dashboard → Workers & Pages → KV → Create namespace `portfolio`. Pages project → Settings → Bindings → KV namespace → `PORTFOLIO_KV`.
3. R2: R2 → Create bucket `portfolio-photos`. Pages project → Settings → Bindings → R2 bucket → `PHOTOS`.
4. Pages env vars (Settings → Environment variables, Production, mark secret):
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (prod app)
   - `SESSION_SECRET` (`openssl rand -hex 32`)
   - `GITHUB_API_TOKEN` (optional — no scopes needed, raises GitHub API rate limit from 60/hr to 5000/hr for `/api/repos`)
5. Cloudflare API token: profile icon → My Profile → API Tokens → Create Token → Edit Cloudflare Workers template (or custom: Account → Cloudflare Pages → Edit).
6. Account ID: dashboard right sidebar, any page.
7. GitHub repo secrets (Settings → Secrets and variables → Actions):
   - `CLOUDFLARE_API_TOKEN` (step 5)
   - `CLOUDFLARE_ACCOUNT_ID` (step 6)
8. Domain: Pages project → Custom domains → add `russl.dev` and `photography.russl.dev` (middleware serves the gallery at that subdomain's root).
9. Leave "Bot Fight Mode" / "Under Attack Mode" off — causes a browser-check interstitial.
10. Push to `main` or re-run the workflow manually.

## Notes

- `robots.txt` disallows `/edit` and `/api/`; edit page has `noindex`.
- Non-owner login → "access denied", no session cookie.
- Save writes to KV key `projects`; home page falls back to the baked-in list if empty/unreachable.
