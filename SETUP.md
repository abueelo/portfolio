# Setup — edit page / GitHub SSO

The `/edit` page (reachable via the last `☼` in the footer) lets **you** log in
with GitHub and choose which repos show on the portfolio, with custom
descriptions. Only the GitHub account `abueelo` is ever granted edit access —
enforced server-side in `functions/_lib.js` (`OWNER`).

## 1. Create a GitHub OAuth app (once for dev, once for prod)

GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**:

| field | dev app | prod app (when deploying) |
|---|---|---|
| Application name | `portfolio (dev)` | `portfolio` |
| Homepage URL | `http://localhost:8788` | `https://russl.dev` |
| Callback URL | `http://localhost:8788/api/callback` | `https://russl.dev/api/callback` |

After creating: **Generate a new client secret** and keep the client id + secret handy.

## 2. Local development

```sh
cp .dev.vars.example .dev.vars     # then edit it:
#   GITHUB_CLIENT_ID     = dev app client id
#   GITHUB_CLIENT_SECRET = dev app client secret
#   SESSION_SECRET       = output of: openssl rand -hex 32

npx wrangler pages dev . --kv PORTFOLIO_KV --r2 PHOTOS
```

Open http://localhost:8788 — the site; http://localhost:8788/edit — the console.
Local KV data is stored under `.wrangler/` (gitignored).

## 3. Deploy to Cloudflare Pages (when ready)

Deploys run via GitHub Actions (`.github/workflows/deploy.yml`) — every push
to `main` builds nothing (there's no build step) and pushes the site + the
`functions/` folder straight to Cloudflare Pages. **Don't also use the
dashboard's "Connect to Git"** on this project — that would create a second,
competing deploy pipeline for the same pushes.

1. **Create the Pages project** (one-time, no Git connection):
   ```sh
   npx wrangler login
   npx wrangler pages project create portfolio --production-branch=main
   ```
2. **KV**: Cloudflare dashboard → Workers & Pages → KV → Create namespace
   (call it `portfolio`). Then Pages project → Settings → Bindings → add
   **KV namespace**: variable name `PORTFOLIO_KV` → the namespace you created.
3. **R2** (photo storage): R2 → Create bucket (call it `portfolio-photos`;
   free tier is 10 GB). Then Pages project → Settings → Bindings → add
   **R2 bucket**: variable name `PHOTOS` → that bucket.
4. **Secrets on Cloudflare**: Pages project → Settings → Environment
   variables → add `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (prod app
   values) and `SESSION_SECRET` (fresh `openssl rand -hex 32`) — mark them
   as secret, for the **Production** environment.
5. **API token for the Action**: Cloudflare dashboard → profile icon →
   **My Profile → API Tokens → Create Token → Edit Cloudflare Workers**
   template (or a custom token scoped to **Account → Cloudflare Pages →
   Edit**). Copy the token.
6. **Account ID**: any page in the Cloudflare dashboard → right sidebar
   shows your Account ID. Copy it.
7. **GitHub secrets**: on `github.com/abueelo/portfolio` → Settings →
   Secrets and variables → Actions → New repository secret, twice:
   - `CLOUDFLARE_API_TOKEN` → the token from step 5
   - `CLOUDFLARE_ACCOUNT_ID` → the ID from step 6
8. **Domain**: Pages project → Custom domains → add `russl.dev`
   (DNS is already on Cloudflare, so it's one click to confirm).
   For the photo gallery, also add `photography.russl.dev` as a second
   custom domain on the same project — a middleware serves the gallery
   at that subdomain's root (it also always lives at /photography).
9. Don't enable "Bot Fight Mode" / "Under Attack Mode" for the zone —
   that's what causes the browser-check interstitial.
10. Push to `main` (or re-run the workflow manually from the Actions tab)
    to trigger the first deploy.

## Notes

- `robots.txt` already disallows `/edit` and `/api/` for crawlers, and the edit
  page carries `noindex`.
- Anyone can *log in* on `/edit`; anyone who isn't `abueelo` gets
  "access denied" and no session cookie.
- Saving writes the list to KV key `projects`; the main page fetches
  `/api/projects` and falls back to the baked-in list if it's empty/unreachable.
