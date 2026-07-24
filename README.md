# portfolio_site

Thom Russell's personal portfolio — live at [russl.dev](https://russl.dev).

Plain HTML/CSS/JS, no build step, no framework. Dark muted terminal aesthetic.

## What's here

- **Home page** — about, projects (pulled from GitHub repos, with custom
  descriptions and optional in-depth write-ups), history, contact links, CV.
- **`/photography`** — a photo gallery, own subdomain-ready via a Pages
  middleware.
- **`/edit`** — a hidden console (GitHub SSO, restricted to one account) for
  managing all of the above without touching code: text fields, photo/CV
  uploads, and a markdown editor with a live preview for project write-ups.

Project write-ups support a small hand-rolled markdown renderer (headings,
bold/italic, lists, code, blockquotes, links) plus numbered image references —
`![caption](2)` for the 2nd uploaded image, with optional `left`/`right` to
float it next to text and an optional width in px.

## Stack

- Cloudflare Pages (static files + Functions for the API)
- Cloudflare KV (site/project/photo metadata) and R2 (photo/CV storage)
- GitHub OAuth for the `/edit` console, restricted to a single owner account
- Deploys automatically via GitHub Actions on every push to `main`

## Setup

See [SETUP.md](SETUP.md) for local development and deployment from scratch
(OAuth app, KV namespace, R2 bucket, secrets, custom domain).
