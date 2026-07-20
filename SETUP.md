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

npx wrangler pages dev . --kv PORTFOLIO_KV
```

Open http://localhost:8788 — the site; http://localhost:8788/edit — the console.
Local KV data is stored under `.wrangler/` (gitignored).

## 3. Deploy to Cloudflare Pages (when ready)

1. Merge `edit-page` into `main` and push.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   → pick `abueelo/portfolio`, branch `main`. No build command; output dir `/`.
3. **KV**: Workers & Pages → KV → Create namespace (call it `portfolio`).
   Then in the Pages project → Settings → Bindings → add **KV namespace**:
   variable name `PORTFOLIO_KV` → the namespace you created.
4. **Secrets**: Pages project → Settings → Environment variables → add
   `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (prod app values) and
   `SESSION_SECRET` (fresh `openssl rand -hex 32`) — mark them as secret.
5. **Domain**: Pages project → Custom domains → add `russl.dev`
   (DNS is already on Cloudflare, so it's one click to confirm).
6. Don't enable "Bot Fight Mode" / "Under Attack Mode" for the zone —
   that's what causes the browser-check interstitial.

## Notes

- `robots.txt` already disallows `/edit` and `/api/` for crawlers, and the edit
  page carries `noindex`.
- Anyone can *log in* on `/edit`; anyone who isn't `abueelo` gets
  "access denied" and no session cookie.
- Saving writes the list to KV key `projects`; the main page fetches
  `/api/projects` and falls back to the baked-in list if it's empty/unreachable.
