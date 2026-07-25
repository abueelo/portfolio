# portfolio_site

[russl.dev](https://russl.dev). Plain HTML/CSS/JS, no build step, no framework.

## Pages

- **Home** — about, projects (from GitHub repos, custom descriptions + optional write-ups), history, contacts, CV.
- **`/photography`** — photo gallery, own subdomain.
- **`/edit`** — GitHub SSO console, single-owner access, manages everything above.

Project write-ups: hand-rolled markdown (headings, bold/italic, lists, code, blockquotes, links) plus numbered image refs — `![caption](2)`, optional `left`/`right` float, optional width in px.

## Stack

- Cloudflare Pages (static + Functions)
- Cloudflare KV (metadata) + R2 (photo/CV storage)
- GitHub OAuth for `/edit`
- GitHub Actions deploy on push to `main`

## Setup

[SETUP.md](SETUP.md)
