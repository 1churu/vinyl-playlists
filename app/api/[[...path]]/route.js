import { NextResponse } from 'next/server';

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;

// Resolve base URL from env or — when running on Vercel — from the runtime env it injects.
// As a last-resort fallback, derive it from the incoming request inside the handler.
function getBaseUrl(request) {
  if (process.env.NEXT_PUBLIC_BASE_URL) return process.env.NEXT_PUBLIC_BASE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (request) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host');
    if (host) return `${proto}://${host}`;
  }
  return '';
}

const SCOPES = [
  'user-read-private',
  'user-read-email',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const COOKIE_NAME = 'spotify_session';

function setSessionCookie(res, data) {
  const value = Buffer.from(JSON.stringify(data)).toString('base64');
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

function getSession(request) {
  const c = request.cookies.get(COOKIE_NAME);
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c.value, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

async function refreshAccessToken(refreshToken) {
  const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function ensureValidToken(request) {
  const session = getSession(request);
  if (!session) return { error: 'not_authenticated' };
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at > now + 30) {
    return { session };
  }
  // refresh
  const refreshed = await refreshAccessToken(session.refresh_token);
  if (!refreshed) return { error: 'refresh_failed' };
  const newSession = {
    ...session,
    access_token: refreshed.access_token,
    expires_at: now + refreshed.expires_in,
  };
  if (refreshed.refresh_token) newSession.refresh_token = refreshed.refresh_token;
  return { session: newSession, updated: true };
}

function withUpdatedCookie(response, sessionResult) {
  if (sessionResult.updated) {
    setSessionCookie(response, sessionResult.session);
  }
  return response;
}

export async function GET(request, { params }) {
  const path = params.path?.join('/') || '';

  // /api/auth/login -> redirect to Spotify
  if (path === 'auth/login') {
    if (!SPOTIFY_CLIENT_ID) {
      return NextResponse.json({ error: 'Spotify not configured' }, { status: 500 });
    }
    const state = Math.random().toString(36).slice(2);
    const url = new URL('https://accounts.spotify.com/authorize');
    url.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI);
    url.searchParams.set('scope', SCOPES);
    url.searchParams.set('state', state);
    url.searchParams.set('show_dialog', 'true');
    return NextResponse.redirect(url.toString());
  }

  // /api/auth/callback/spotify
  if (path === 'auth/callback/spotify') {
    const baseUrl = getBaseUrl(request);
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    console.log(`[/api/auth/callback] code_present=${!!code} error=${error}`);
    if (error || !code) {
      const redirect = new URL('/?auth_error=' + encodeURIComponent(error || 'no_code'), baseUrl);
      return NextResponse.redirect(redirect.toString());
    }
    try {
      const basic = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: SPOTIFY_REDIRECT_URI,
        }),
      });
      console.log(`[/api/auth/callback] tokenRes status=${tokenRes.status}`);
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        console.error(`[/api/auth/callback] token exchange error:`, t.slice(0, 300));
        const redirect = new URL('/?auth_error=token_exchange_failed&detail=' + encodeURIComponent(t.slice(0, 200)), baseUrl);
        return NextResponse.redirect(redirect.toString());
      }
      const tokens = await tokenRes.json();
      const now = Math.floor(Date.now() / 1000);
      const session = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: now + tokens.expires_in,
        scope: tokens.scope,
      };
      const cookieValue = Buffer.from(JSON.stringify(session)).toString('base64');
      console.log(`[/api/auth/callback] setting cookie, value length=${cookieValue.length}`);
      const redirectUrl = new URL('/?screen=library', baseUrl).toString();
      // Use a 200 OK HTML response (NOT a 302 redirect) — Cloudflare and other CDNs
      // are more reliable about forwarding Set-Cookie on normal responses than redirects.
      const html = `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="0;url=${redirectUrl}">
<title>Connecting...</title>
<style>body{background:#080808;color:#888;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:11px;letter-spacing:3px}</style>
</head><body>
CONNECTING TO SPOTIFY...
<script>setTimeout(function(){window.location.href=${JSON.stringify(redirectUrl)}},50);</script>
</body></html>`;
      const res = new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
      res.cookies.set({
        name: COOKIE_NAME,
        value: cookieValue,
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
      console.log(`[/api/auth/callback] returning 200 HTML with cookie, set-cookie header:`, res.headers.get('set-cookie')?.slice(0, 200));
      return res;
    } catch (e) {
      console.error(`[/api/auth/callback] exception:`, e);
      const redirect = new URL('/?auth_error=exception&detail=' + encodeURIComponent(String(e).slice(0,200)), baseUrl);
      return NextResponse.redirect(redirect.toString());
    }
  }

  // /api/auth/logout
  if (path === 'auth/logout') {
    const baseUrl = getBaseUrl(request);
    const res = NextResponse.redirect(new URL('/?disconnected=1', baseUrl).toString());
    // Fully clear the cookie with multiple-strategy
    res.cookies.set(COOKIE_NAME, '', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    });
    return res;
  }

  // /api/me
  if (path === 'me') {
    // DEBUG: log all incoming cookies
    const cookieHeader = request.headers.get('cookie');
    console.log(`[/api/me] incoming cookie header: ${cookieHeader ? cookieHeader.slice(0, 200) : 'NONE'}`);
    const sessionCookie = request.cookies.get(COOKIE_NAME);
    console.log(`[/api/me] session cookie present: ${!!sessionCookie}, value length: ${sessionCookie?.value?.length || 0}`);

    const result = await ensureValidToken(request);
    if (result.error) return NextResponse.json({ authenticated: false, error: result.error }, { status: 401 });
    const r = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    if (!r.ok) {
      return NextResponse.json({ authenticated: false, error: 'spotify_me_failed' }, { status: 401 });
    }
    const data = await r.json();
    const response = NextResponse.json({ authenticated: true, user: data });
    return withUpdatedCookie(response, result);
  }

  // /api/token  — return raw access token for Web Playback SDK
  if (path === 'token') {
    const result = await ensureValidToken(request);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });
    const response = NextResponse.json({
      access_token: result.session.access_token,
      expires_at: result.session.expires_at,
    });
    return withUpdatedCookie(response, result);
  }

  // /api/playlists
  if (path === 'playlists') {
    const result = await ensureValidToken(request);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });
    const all = [];
    let next = 'https://api.spotify.com/v1/me/playlists?limit=50';
    let pageCount = 0;
    while (next && all.length < 200) {
      const r = await fetch(next, { headers: { 'Authorization': `Bearer ${result.session.access_token}` } });
      if (!r.ok) {
        const txt = await r.text();
        console.error('[/api/playlists] Spotify error:', r.status, txt.slice(0, 300));
        return NextResponse.json({ error: 'spotify_playlists_failed', status: r.status, detail: txt.slice(0, 300) }, { status: 500 });
      }
      const d = await r.json();
      pageCount++;
      // Log first page raw structure for debugging
      if (pageCount === 1) {
        console.log('[/api/playlists] page 1 items:', (d.items || []).length, 'total:', d.total);
        const sample = (d.items || []).slice(0, 3);
        for (const s of sample) {
          console.log('[/api/playlists] sample:', {
            id: s?.id,
            name: s?.name,
            tracks_total: s?.tracks?.total,
            tracks_keys: s?.tracks ? Object.keys(s.tracks) : 'null',
            owner: s?.owner?.display_name,
          });
        }
      }
      for (const p of (d.items || [])) {
        if (!p) continue;
        all.push({
          id: p.id,
          name: p.name,
          tracks: p.tracks?.total ?? 0,
          tracks_href: p.tracks?.href || null,
          image: p.images?.[0]?.url || null,
          owner: p.owner?.display_name || '',
          owner_id: p.owner?.id || '',
          description: p.description || '',
          public: p.public,
          uri: p.uri,
        });
      }
      next = d.next;
    }
    console.log('[/api/playlists] returning', all.length, 'playlists, sample tracks counts:', all.slice(0, 5).map(p => p.tracks));
    const response = NextResponse.json({ playlists: all, scope: result.session.scope });
    return withUpdatedCookie(response, result);
  }

  // /api/playlist/:id
  if (path.startsWith('playlist/')) {
    const id = path.split('/')[1];
    const result = await ensureValidToken(request);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });

    console.log(`[/api/playlist/${id}] === FETCH START ===`);
    console.log(`[/api/playlist/${id}] SCOPE: ${result.session.scope}`);

    // 0) Get the authenticated user ID so we can compare with playlist owner
    let authedUserId = null;
    try {
      const meR = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${result.session.access_token}` },
      });
      if (meR.ok) {
        const meData = await meR.json();
        authedUserId = meData.id;
        console.log(`[/api/playlist/${id}] AUTHED_USER: id=${meData.id} country=${meData.country} product=${meData.product}`);
      }
    } catch { }

    // 1) Meta call WITHOUT fields parameter — get the raw response
    const metaUrl = `https://api.spotify.com/v1/playlists/${id}`;
    const metaRes = await fetch(metaUrl, {
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    console.log(`[/api/playlist/${id}] META status=${metaRes.status}`);
    if (!metaRes.ok) {
      const t = await metaRes.text();
      console.error(`[/api/playlist/${id}] META error:`, t);
      return NextResponse.json({ error: 'fetch_meta_failed', status: metaRes.status, detail: t.slice(0, 500) }, { status: 500 });
    }
    const meta = await metaRes.json();
    console.log(`[/api/playlist/${id}] META keys=[${Object.keys(meta).join(',')}]`);
    console.log(`[/api/playlist/${id}] META name="${meta.name}" owner_id="${meta.owner?.id}" owner_name="${meta.owner?.display_name}" is_owner=${meta.owner?.id === authedUserId}`);
    console.log(`[/api/playlist/${id}] META public=${meta.public} collaborative=${meta.collaborative} snapshot_id=${meta.snapshot_id}`);
    console.log(`[/api/playlist/${id}] META.tracks =`, JSON.stringify(meta.tracks)?.slice(0, 500) || '(missing)');
    console.log(`[/api/playlist/${id}] META.items length=${meta.items?.length}, items_keys=${meta.items?.[0] ? Object.keys(meta.items[0]).join(',') : 'n/a'}`);
    if (meta.items?.[0]) {
      console.log(`[/api/playlist/${id}] META.items[0] sample:`, JSON.stringify(meta.items[0]).slice(0, 500));
    }
    // Dump the FULL response (first 2000 chars) so we can see EVERY field
    console.log(`[/api/playlist/${id}] FULL META JSON (first 2000 chars):`, JSON.stringify(meta).slice(0, 2000));

    const debug = {
      authed_user_id: authedUserId,
      owner_id: meta.owner?.id,
      is_owner: meta.owner?.id === authedUserId,
      public: meta.public,
      collaborative: meta.collaborative,
      meta_tracks_field: meta.tracks ? 'present' : 'missing',
      meta_items_at_root: meta.items?.length ?? null,
      stages: [],
    };
    const tracks = [];

    // ── Helper: parse a single item (handles BOTH old and new Spotify shapes) ──
    // Old shape: { track: { name, artists, uri, ... } }
    // New shape (post-2024): { item: { name, artists, uri, type: 'track', ... } }
    // Some endpoints: direct { name, artists, uri, ... }
    const parseItem = (entry) => {
      if (!entry) return null;
      const t = entry.item || entry.track || entry;
      if (!t) return null;
      // Skip non-track items (e.g. podcast episodes)
      if (t.type && t.type !== 'track' && t.type !== 'episode' && !t.uri?.includes('track')) return null;
      const name = t.name;
      const uri = t.uri || (t.linked_from?.uri);
      if (!name && !uri) return null;
      return {
        name: name || '(Untitled)',
        artists: (t.artists || []).map(a => a?.name || '').filter(Boolean).join(', '),
        duration_ms: t.duration_ms || 0,
        preview_url: t.preview_url || null,
        uri: uri || null,
        is_local: !!(entry.is_local || t.is_local),
      };
    };

    // APPROACH A: items.items at root (Spotify's new 2024+ shape)
    if (meta.items?.items?.length > 0) {
      const inner = meta.items.items;
      debug.stages.push({ stage: 'items.items_root', count: inner.length });
      for (const entry of inner) {
        const parsed = parseItem(entry);
        if (parsed) tracks.push(parsed);
      }
      console.log(`[/api/playlist/${id}] APPROACH_A (items.items): added ${tracks.length} tracks`);

      // Paginate via the next link OR construct manually using /items endpoint
      const reportedTotal = meta.items.total ?? null;
      let offset = inner.length;
      const limit = 100;
      const maxItems = reportedTotal || 2000;
      while (offset < maxItems && offset < 2000) {
        // Try /items endpoint (the new shape uses this, not /tracks)
        const pageUrl = `https://api.spotify.com/v1/playlists/${id}/items?limit=${limit}&offset=${offset}`;
        try {
          const pageRes = await fetch(pageUrl, {
            headers: { 'Authorization': `Bearer ${result.session.access_token}` },
          });
          console.log(`[/api/playlist/${id}] /items page offset=${offset} status=${pageRes.status}`);
          debug.stages.push({ stage: 'items_paginate', offset, status: pageRes.status });
          if (!pageRes.ok) break;
          const pd = await pageRes.json();
          const pageItems = pd.items || [];
          if (pageItems.length === 0) break;
          for (const entry of pageItems) {
            const parsed = parseItem(entry);
            if (parsed) tracks.push(parsed);
          }
          if (pageItems.length < limit) break;
          offset += limit;
        } catch (e) {
          console.error(`[/api/playlist/${id}] paginate error:`, e.message);
          break;
        }
      }
    }

    // APPROACH A2: legacy tracks.items shape (in case Spotify reverts)
    if (tracks.length === 0 && meta.tracks?.items?.length > 0) {
      debug.stages.push({ stage: 'tracks.items_legacy', count: meta.tracks.items.length });
      for (const entry of meta.tracks.items) {
        const parsed = parseItem(entry);
        if (parsed) tracks.push(parsed);
      }
      console.log(`[/api/playlist/${id}] APPROACH_A2 (legacy tracks.items): added ${tracks.length} tracks`);
    }

    // APPROACH B: /tracks endpoint (returns 403 for dev apps — only worth trying as last resort)
    if (tracks.length === 0) {
      const trUrl = `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=0`;
      console.log(`[/api/playlist/${id}] APPROACH_B: GET ${trUrl}`);
      const tr = await fetch(trUrl, {
        headers: { 'Authorization': `Bearer ${result.session.access_token}` },
      });
      console.log(`[/api/playlist/${id}] APPROACH_B status=${tr.status}`);
      const rawBody = await tr.text();
      debug.stages.push({ stage: 'tracks_endpoint', status: tr.status });
      if (tr.ok) {
        try {
          const td = JSON.parse(rawBody);
          for (const entry of (td.items || [])) {
            const parsed = parseItem(entry);
            if (parsed) tracks.push(parsed);
          }
        } catch { }
      }
    }

    console.log(`[/api/playlist/${id}] === FINAL tracks=${tracks.length} ===`);

    const totalMs = tracks.reduce((s, t) => s + t.duration_ms, 0);
    const response = NextResponse.json({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      image: meta.images?.[0]?.url || null,
      owner: meta.owner?.display_name || '',
      uri: meta.uri,
      tracks,
      track_count: tracks.length,
      total_reported: meta.tracks?.total ?? tracks.length,
      duration_ms: totalMs,
      debug,
    });
    return withUpdatedCookie(response, result);
  }

  // /api/config -> exposes redirect uri for the user to copy
  if (path === 'config') {
    return NextResponse.json({
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id_present: !!SPOTIFY_CLIENT_ID,
    });
  }

  // /api/debug-raw - dumps RAW Spotify responses for inspection
  if (path === 'debug-raw') {
    const result = await ensureValidToken(request);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });

    const out = { scope: result.session.scope, steps: {} };

    // Step 1: /me
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    out.steps.me = { status: meRes.status };
    if (meRes.ok) {
      const me = await meRes.json();
      out.steps.me.data = { id: me.id, display_name: me.display_name, country: me.country, product: me.product };
    }

    // Step 2: /me/playlists?limit=3
    const plRes = await fetch('https://api.spotify.com/v1/me/playlists?limit=3', {
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    out.steps.playlists = { status: plRes.status };
    if (plRes.ok) {
      const pl = await plRes.json();
      out.steps.playlists.total = pl.total;
      out.steps.playlists.items = (pl.items || []).map(p => ({
        id: p?.id,
        name: p?.name,
        owner_id: p?.owner?.id,
        owner_name: p?.owner?.display_name,
        tracks_total: p?.tracks?.total,
        tracks_href: p?.tracks?.href,
        tracks_keys: p?.tracks ? Object.keys(p.tracks) : null,
        raw_tracks: p?.tracks, // entire tracks object
      }));
    }

    // Step 3: For the first playlist, fetch its tracks
    const firstPlId = out.steps.playlists?.items?.[0]?.id;
    if (firstPlId) {
      // 3a: meta call
      const metaR = await fetch(`https://api.spotify.com/v1/playlists/${firstPlId}`, {
        headers: { 'Authorization': `Bearer ${result.session.access_token}` },
      });
      out.steps.first_meta = { status: metaR.status };
      if (metaR.ok) {
        const m = await metaR.json();
        out.steps.first_meta.name = m.name;
        out.steps.first_meta.tracks_total = m.tracks?.total;
        out.steps.first_meta.embedded_items_count = (m.tracks?.items || []).length;
        out.steps.first_meta.embedded_first_2 = (m.tracks?.items || []).slice(0, 2).map(it => ({
          has_track: !!it?.track,
          track_name: it?.track?.name,
          track_uri: it?.track?.uri,
          is_local: it?.track?.is_local,
          is_playable: it?.track?.is_playable,
        }));
      } else {
        out.steps.first_meta.error = (await metaR.text()).slice(0, 300);
      }
      // 3b: tracks endpoint (no market)
      const trR = await fetch(`https://api.spotify.com/v1/playlists/${firstPlId}/tracks?limit=5`, {
        headers: { 'Authorization': `Bearer ${result.session.access_token}` },
      });
      out.steps.first_tracks_no_market = { status: trR.status };
      if (trR.ok) {
        const td = await trR.json();
        out.steps.first_tracks_no_market.items_count = (td.items || []).length;
        out.steps.first_tracks_no_market.first_5 = (td.items || []).slice(0, 5).map(it => ({
          has_track: !!it?.track,
          track_name: it?.track?.name,
          track_uri: it?.track?.uri,
        }));
      } else {
        out.steps.first_tracks_no_market.error = (await trR.text()).slice(0, 300);
      }
      // 3c: tracks endpoint with market
      const trR2 = await fetch(`https://api.spotify.com/v1/playlists/${firstPlId}/tracks?limit=5&market=from_token`, {
        headers: { 'Authorization': `Bearer ${result.session.access_token}` },
      });
      out.steps.first_tracks_with_market = { status: trR2.status };
      if (trR2.ok) {
        const td = await trR2.json();
        out.steps.first_tracks_with_market.items_count = (td.items || []).length;
        out.steps.first_tracks_with_market.first_5 = (td.items || []).slice(0, 5).map(it => ({
          has_track: !!it?.track,
          track_name: it?.track?.name,
        }));
      } else {
        out.steps.first_tracks_with_market.error = (await trR2.text()).slice(0, 300);
      }
    }

    return withUpdatedCookie(NextResponse.json(out), result);
  }

  return NextResponse.json({ error: 'not_found', path }, { status: 404 });
}

export async function POST(request, { params }) {
  const path = params.path?.join('/') || '';
  const result = await ensureValidToken(request);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 401 });

  // /api/play  { device_id, context_uri, offset_uri, uris }
  if (path === 'play') {
    const body = await request.json().catch(() => ({}));
    const { device_id, context_uri, offset_uri, uris } = body;
    if (!device_id) return NextResponse.json({ error: 'device_id_required' }, { status: 400 });
    // Transfer playback first (with play: true to wake the device)
    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${result.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_ids: [device_id], play: false }),
    });
    // Tiny delay so Spotify registers the transfer
    await new Promise(res => setTimeout(res, 250));
    let playBody = {};
    if (uris && uris.length) {
      playBody = { uris };
    } else if (context_uri) {
      playBody = { context_uri };
      if (offset_uri) playBody.offset = { uri: offset_uri };
    }
    let r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${result.session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(playBody),
    });
    // One internal retry on 404 (device not ready yet)
    if (r.status === 404) {
      await new Promise(res => setTimeout(res, 600));
      r = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device_id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${result.session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(playBody),
      });
    }
    if (!r.ok && r.status !== 204) {
      const t = await r.text();
      return NextResponse.json({ error: 'play_failed', status: r.status, detail: t.slice(0, 300) }, { status: r.status });
    }
    return withUpdatedCookie(NextResponse.json({ ok: true }), result);
  }

  // /api/next  { device_id }
  if (path === 'next') {
    const body = await request.json().catch(() => ({}));
    const { device_id } = body;
    const url = device_id
      ? `https://api.spotify.com/v1/me/player/next?device_id=${device_id}`
      : 'https://api.spotify.com/v1/me/player/next';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    return withUpdatedCookie(NextResponse.json({ ok: r.ok || r.status === 204 }), result);
  }

  // /api/previous  { device_id }
  if (path === 'previous') {
    const body = await request.json().catch(() => ({}));
    const { device_id } = body;
    const url = device_id
      ? `https://api.spotify.com/v1/me/player/previous?device_id=${device_id}`
      : 'https://api.spotify.com/v1/me/player/previous';
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    return withUpdatedCookie(NextResponse.json({ ok: r.ok || r.status === 204 }), result);
  }

  // /api/pause { device_id }
  if (path === 'pause') {
    const body = await request.json().catch(() => ({}));
    const { device_id } = body;
    const url = device_id
      ? `https://api.spotify.com/v1/me/player/pause?device_id=${device_id}`
      : 'https://api.spotify.com/v1/me/player/pause';
    const r = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${result.session.access_token}` },
    });
    return withUpdatedCookie(NextResponse.json({ ok: r.ok || r.status === 204 }), result);
  }

  return NextResponse.json({ error: 'not_implemented' }, { status: 501 });
}
