# CRATE DIGGER · Vinyl OS

A minimalist + edgy Next.js web app that turns your Spotify library into
interactive vinyl records. Drag to spin, click to drop the tonearm, and play
full tracks (Spotify Premium) or 30-second previews (free) — with adjustable
procedural vinyl crackle.

---

## Quick start (local)

```bash
yarn install
cp .env.example .env.local
# fill in SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI
yarn dev
```

Open <http://127.0.0.1:3000>.

> **Note:** Spotify recommends using `127.0.0.1` (not `localhost`) for the
> redirect URI in local development.

---

## Deploy to Vercel

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create crate-digger --public --source=. --push
```

### 2. Import the repo into Vercel

- Go to <https://vercel.com/new>
- Pick the GitHub repo → Vercel auto-detects Next.js.
- Click **Deploy** (it will fail at runtime until env vars are set — that's OK).

### 3. Add environment variables in Vercel

In **Project Settings → Environment Variables**, add (for Production at least):

| Name | Value |
|---|---|
| `SPOTIFY_CLIENT_ID` | from Spotify Dashboard |
| `SPOTIFY_CLIENT_SECRET` | from Spotify Dashboard |
| `SPOTIFY_REDIRECT_URI` | `https://<your-project>.vercel.app/api/auth/callback/spotify` |

`NEXT_PUBLIC_BASE_URL` and `MONGO_URL` are optional — the app auto-detects the
base URL from Vercel's `VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL` and from
incoming request headers, so set `NEXT_PUBLIC_BASE_URL` only if you use a
custom domain and want absolute links to use it.

### 4. Register the redirect URI in Spotify

Go to <https://developer.spotify.com/dashboard> → your app → **Edit Settings →
Redirect URIs** and add the **exact** URL you used for
`SPOTIFY_REDIRECT_URI`. Different deployments (preview, prod, custom domain)
need separate redirect URIs registered.

### 5. Redeploy

In Vercel → Deployments → "···" → **Redeploy**. Done.

---

## Features

- Spotify OAuth 2.0 (authorization-code flow with refresh-token rotation)
- Inline-SVG vinyl visualizer with color-tinted edge ring, grooves, and
  album-art-clipped center label
- Drag-to-spin physics with inertia decay
- Tonearm animation + synthesized "needle drop" SFX
- Two-layer procedural vinyl crackle (Tone.js)
- Spotify Web Playback SDK for Premium full-track streaming
- 30-second preview fallback for free accounts
- **Pause/resume** preserves playback position (no restart)
- Library: search, BY YOU filter, A–Z / Z–A / RECENT sort, 1/2/3/4-column grid
- Mobile-friendly: responsive layout, smaller vinyl + tonearm, 1/2-column grid

## Tech stack

- Next.js 14 (App Router) + React 18
- Tone.js for procedural audio
- Spotify Web API + Web Playback SDK
- Inline styles + Tailwind base + a small `globals.css`
- MongoDB env wired but currently unused (no persistence)

## File layout

```
app/
├── layout.js                    Root <html> + viewport meta
├── globals.css                  Tailwind + slider + keyframes
├── page.js                      Frontend (Connect, Library, Player screens)
└── api/[[...path]]/route.js     Spotify OAuth + REST proxy
```

## Spotify API quirks (handled)

- **Cookie-stripping on redirects** — Cloudflare-style CDNs drop `Set-Cookie`
  from 302s, so the OAuth callback returns 200 OK HTML with a `<script>`
  redirect.
- **Track shape change (Nov 2024)** — Dev-app responses nest tracks as
  `items.items[].item` (not `tracks.items[].track`). The parser handles both.
- **Extended Quota Mode** — Foreign playlists return zero tracks for
  unapproved dev apps. Duration & tracklist hide gracefully.

## Endpoints (`/api/...`)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/auth/login` | Redirect to Spotify authorize page |
| GET | `/auth/callback/spotify` | Token exchange + set session cookie |
| GET | `/auth/logout` | Clear cookie |
| GET | `/me` | Current user (or 401) |
| GET | `/token` | Raw access token for the SDK |
| GET | `/playlists` | Paginated playlists |
| GET | `/playlist/:id` | Playlist details + tracks |
| GET | `/config` | Expose redirect URI for connect screen |
| POST | `/play` | Start playback on SDK device |
| POST | `/pause` | Pause playback |
| POST | `/next` | Skip next |
| POST | `/previous` | Skip previous |

## Known limitations

- No persistence (MongoDB wired but unused).
- Algorithmic / 3rd-party playlists return zero tracks until Spotify approves
  your app for Extended Quota Mode.
- Browser autoplay policies may delay the first crackle until the user
  interacts with the page.
