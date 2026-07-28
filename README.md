# portfolio_site

Source for my site, [russl.dev](https://russl.dev). Plain HTML/CSS/JS — no build step, no framework, no dependencies.

The home page pulls project info from my GitHub repos, with custom descriptions and optional longer write-ups on top. There's a photography page on its own subdomain, and an `/edit` page (locked to just me via GitHub OAuth) for managing all of it.

Write-ups use a small hand-rolled markdown format — headings, bold/italic, lists, code, blockquotes, links, and numbered image refs like `![caption](2)`, with optional left/right floating and a width.

Runs on Cloudflare Pages + Functions, KV for metadata, R2 for photos and the CV. Deploys through GitHub Actions on push to main.

Setup steps are in [SETUP.md](SETUP.md).
