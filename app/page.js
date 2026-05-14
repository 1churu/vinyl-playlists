'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

const FF = `'IBM Plex Mono', 'Courier New', monospace`;

// Fallback deterministic color from id
function colorsFromId(id) {
  let h = 0;
  for (let i = 0; i < (id || '').length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return [`hsl(${hue}, 55%, 12%)`, `hsl(${hue}, 75%, 55%)`];
}

function msToDur(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

// Dominant color extraction from image (canvas pixel sampling)
const colorCache = new Map();
function extractDominantColor(imageUrl) {
  return new Promise((resolve) => {
    if (!imageUrl) return resolve(null);
    if (colorCache.has(imageUrl)) return resolve(colorCache.get(imageUrl));
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = 32, h = 32;
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        // Find most saturated, mid-bright pixel (avoid black/white)
        let best = { r: 128, g: 128, b: 128, score: -1 };
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const bright = (r + g + b) / 3;
          // Prefer saturated, mid-bright
          const score = sat * 2 + (bright > 40 && bright < 230 ? 0.8 : 0);
          if (score > best.score) best = { r, g, b, score };
        }
        // Boost brightness if too dark
        const boost = (c) => Math.min(255, Math.max(80, c * 1.3));
        const result = {
          bright: `rgb(${Math.round(boost(best.r))}, ${Math.round(boost(best.g))}, ${Math.round(boost(best.b))})`,
          dark: `rgb(${Math.round(best.r * 0.35)}, ${Math.round(best.g * 0.35)}, ${Math.round(best.b * 0.35)})`,
        };
        colorCache.set(imageUrl, result);
        resolve(result);
      } catch (e) {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

function VinylDisc({ pl, size, spin, onClick, color, rotation }) {
  const grooves = Array.from({ length: 26 }, (_, i) => i);
  const [dark, bright] = color
    ? [color.dark, color.bright]
    : colorsFromId(pl.id);
  // If a numeric rotation is provided, drive via JS (for drag). Else use CSS animation.
  const useJsRot = typeof rotation === 'number';
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 400 400"
      onClick={useJsRot ? undefined : onClick}
      style={{
        display: 'block',
        cursor: onClick ? 'pointer' : 'default',
        animation: !useJsRot && spin ? 'spin-vinyl 2.6s linear infinite' : 'none',
        transform: useJsRot ? `rotate(${rotation}deg)` : undefined,
        filter: 'drop-shadow(0 6px 28px rgba(0,0,0,0.55)) drop-shadow(0 -2px 14px rgba(0,0,0,0.25))',
        flexShrink: 0,
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      <defs>
        <radialGradient id={`vbg${pl.id}`} cx="50%" cy="50%">
          <stop offset="0%" stopColor="#1e1e1e" />
          <stop offset="55%" stopColor="#0f0f0f" />
          <stop offset="100%" stopColor="#080808" />
        </radialGradient>
        <radialGradient id={`lbl${pl.id}`} cx="38%" cy="32%" r="68%">
          <stop offset="0%" stopColor={bright} stopOpacity="0.82" />
          <stop offset="100%" stopColor={dark} />
        </radialGradient>
        <clipPath id={`clip${pl.id}`}>
          <circle cx="200" cy="200" r="75" />
        </clipPath>
      </defs>

      <circle cx="200" cy="200" r="196" fill={`url(#vbg${pl.id})`} />

      {/* Color-tinted outer edge ring */}
      <circle cx="200" cy="200" r="194" fill="none" stroke={bright} strokeWidth="1" strokeOpacity="0.25" />
      <circle cx="200" cy="200" r="190" fill="none" stroke={bright} strokeWidth="0.5" strokeOpacity="0.12" />

      {grooves.map(i => (
        <circle key={i} cx="200" cy="200"
          r={85 + i * 4.1}
          fill="none"
          stroke={i % 5 === 0 ? '#222' : '#131313'}
          strokeWidth={i % 5 === 0 ? 1.4 : 0.6}
        />
      ))}

      <circle cx="200" cy="200" r="75" fill={`url(#lbl${pl.id})`} />

      {pl.image && (
        <image
          href={pl.image}
          x="125" y="125" width="150" height="150"
          clipPath={`url(#clip${pl.id})`}
          preserveAspectRatio="xMidYMid slice"
          opacity="0.95"
          crossOrigin="anonymous"
        />
      )}

      <circle cx="200" cy="200" r="75" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      <circle cx="200" cy="200" r="75" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />

      <circle cx="200" cy="200" r="7" fill="#080808" />
      <circle cx="200" cy="200" r="6.5" fill="none" stroke="#2a2a2a" strokeWidth="0.7" />
      <circle cx="200" cy="200" r="2" fill="#1a1a1a" />

      <circle cx="200" cy="200" r="196" fill="none" stroke="#1c1c1c" strokeWidth="1.5" />
    </svg>
  );
}

function Tonearm({ playing, scale = 1 }) {
  // Base SVG is 118 × 295 designed for a 460-px vinyl. Scale everything for mobile.
  const w = 118 * scale;
  const h = 295 * scale;
  // Position offsets also scale so the tonearm sits at the correct spot above/right of the disc
  return (
    <div style={{
      position: 'absolute',
      top: `${-40 * scale}px`,
      right: `${-58 * scale}px`,
      transformOrigin: 'top left',
      transform: playing ? 'rotate(26deg)' : 'rotate(0deg)',
      transition: 'transform 1.5s cubic-bezier(0.34, 1.15, 0.64, 1)',
      zIndex: 20,
      pointerEvents: 'none',
    }}>
      <svg width={w} height={h} viewBox="0 0 118 295">
        <rect x="16" y="4" width="20" height="26" rx="5" fill="#1c1c1c" stroke="#2e2e2e" strokeWidth="1" />
        <circle cx="58" cy="22" r="20" fill="#1c1c1c" stroke="#333" strokeWidth="1.2" />
        <circle cx="58" cy="22" r="10" fill="#141414" stroke="#3a3a3a" strokeWidth="0.8" />
        <circle cx="58" cy="22" r="3.5" fill="#252525" />
        <rect x="53.5" y="40" width="9" height="195" rx="2" fill="#4a4a4a" />
        <rect x="55.5" y="40" width="3" height="195" fill="rgba(255,255,255,0.07)" />
        <rect x="45" y="233" width="26" height="44" rx="3.5" fill="#1c1c1c" stroke="#333" strokeWidth="0.8" />
        <rect x="49" y="240" width="14" height="26" rx="2" fill="#252525" />
        <line x1="56" y1="277" x2="55" y2="288" stroke="#555" strokeWidth="1.5" />
        <ellipse cx="55" cy="289" rx="2.5" ry="1.5" fill="#777" />
      </svg>
    </div>
  );
}

const btn = (extra = {}) => ({
  background: 'transparent',
  border: '1px solid #252525',
  color: '#ddd',
  fontFamily: FF,
  fontSize: 11,
  letterSpacing: '3px',
  textTransform: 'uppercase',
  cursor: 'pointer',
  transition: 'all 0.14s',
  ...extra,
});

function App() {
  const [screen, setScreen] = useState('connect');
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [loadingLib, setLoadingLib] = useState(false);
  const [playlist, setPlaylist] = useState(null);
  const [playlistDetail, setPlaylistDetail] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [crackle, setCrackle] = useState(true);
  const [hoverPl, setHoverPl] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [redirectUri, setRedirectUri] = useState('');
  const [search, setSearch] = useState('');
  const [colors, setColors] = useState({}); // id -> {bright, dark}
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkDeviceId, setSdkDeviceId] = useState(null);
  const [sdkError, setSdkError] = useState(null);
  const [currentTrack, setCurrentTrack] = useState(null); // {name, artists} from SDK
  const [previewIdx, setPreviewIdx] = useState(0);
  const [playMode, setPlayMode] = useState(null); // 'premium' | 'preview' | 'silent'
  const [crackleVol, setCrackleVol] = useState(45); // 0-100
  const [filterOwned, setFilterOwned] = useState(false);
  const [gridCols, setGridCols] = useState(2);
  const [sortMode, setSortMode] = useState('default'); // 'default' | 'az' | 'za'
  const [isMobile, setIsMobile] = useState(false);
  const [isNarrow, setIsNarrow] = useState(false); // tablet/intermediate

  // Track viewport size for responsive layout
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      setIsMobile(w < 760);
      setIsNarrow(w < 1024);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const noiseRef = useRef(null);
  const playerRef = useRef(null);
  const audioRef = useRef(null);
  const toneRef = useRef(null);
  const playLockRef = useRef(false); // prevents double-trigger on rapid clicks
  const playedContextRef = useRef(null); // tracks the last playlist.uri that was started, for resume vs restart
  const previewPosRef = useRef({ idx: 0, t: 0 }); // last preview position for resume
  const [isTransitioning, setIsTransitioning] = useState(false);

  // INIT: check auth + URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('auth_error');
    const detail = params.get('detail');
    const disconnected = params.get('disconnected');

    // Just logged out: skip /me check, clear everything, force connect screen
    if (disconnected) {
      setUser(null);
      setPlaylists([]);
      setPlaylist(null);
      setPlaylistDetail(null);
      setScreen('connect');
      setAuthError(null);
      window.history.replaceState({}, '', '/');
      fetch('/api/config').then(r => r.json()).then(d => setRedirectUri(d.redirect_uri || '')).catch(() => { });
      return;
    }

    if (err) {
      setAuthError({ error: err, detail });
      fetch('/api/config').then(r => r.json()).then(d => setRedirectUri(d.redirect_uri || '')).catch(() => { });
      window.history.replaceState({}, '', '/');
      return;
    }
    fetch('/api/me').then(async r => {
      if (r.ok) {
        const d = await r.json();
        setUser(d.user);
        setScreen('library');
        if (params.get('screen')) window.history.replaceState({}, '', '/');
      }
    }).catch(() => { });
    fetch('/api/config').then(r => r.json()).then(d => setRedirectUri(d.redirect_uri || '')).catch(() => { });
  }, []);

  // LOAD playlists
  useEffect(() => {
    if (screen !== 'library' || playlists.length > 0) return;
    setLoadingLib(true);
    fetch('/api/playlists').then(async r => {
      if (!r.ok) {
        if (r.status === 401) setScreen('connect');
        return;
      }
      const d = await r.json();
      setPlaylists(d.playlists || []);
    }).catch(() => { }).finally(() => setLoadingLib(false));
  }, [screen]);

  // Extract dominant colors for all visible playlists (lazy)
  useEffect(() => {
    if (playlists.length === 0) return;
    playlists.forEach(p => {
      if (!p.image || colors[p.id]) return;
      extractDominantColor(p.image).then(c => {
        if (c) setColors(prev => ({ ...prev, [p.id]: c }));
      });
    });
  }, [playlists]);

  // Load playlist detail + RESET ALL PLAY STATE when switching to a new vinyl
  useEffect(() => {
    if (screen !== 'player' || !playlist) return;
    // Immediately clear stale state so previous track doesn't flash
    setPlaylistDetail(null);
    setPreviewIdx(0);
    setCurrentTrack(null);
    setPlaying(false);
    setPlayMode(null);
    // Reset resume positions for the new playlist
    playedContextRef.current = null;
    previewPosRef.current = { idx: 0, t: 0 };
    // Stop any in-flight audio from previous vinyl
    stopCrackle();
    stopPreview();
    // Pause Spotify if it was playing the previous playlist
    if (sdkDeviceId) {
      fetch('/api/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: sdkDeviceId }),
      }).catch(() => { });
    }
    // Release any stale transition lock
    playLockRef.current = false;
    setIsTransitioning(false);

    fetch(`/api/playlist/${playlist.id}`).then(r => r.ok ? r.json() : null).then(d => {
      if (d) setPlaylistDetail(d);
    }).catch(() => { });
  }, [screen, playlist]);

  // WEB PLAYBACK SDK init — runs ONCE per user session, persists across playlist switches
  useEffect(() => {
    if (!user || user.product !== 'premium') return;
    if (playerRef.current) return;

    // Load SDK
    if (!window.Spotify) {
      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    }

    const initPlayer = () => {
      if (playerRef.current) return;
      const player = new window.Spotify.Player({
        name: 'CRATE DIGGER',
        getOAuthToken: async (cb) => {
          try {
            const tr = await fetch('/api/token');
            const td = await tr.json();
            if (td.access_token) cb(td.access_token);
          } catch { }
        },
        volume: 0.7,
      });

      player.addListener('ready', ({ device_id }) => {
        console.log('[SDK] ready', device_id);
        setSdkReady(true);
        setSdkDeviceId(device_id);
      });
      player.addListener('not_ready', () => setSdkReady(false));
      player.addListener('initialization_error', ({ message }) => setSdkError(message));
      player.addListener('authentication_error', ({ message }) => setSdkError(message));
      player.addListener('account_error', ({ message }) => setSdkError(message));
      player.addListener('player_state_changed', (state) => {
        if (!state) return;
        // Ignore SDK state echoes during our manual transition to prevent jitter
        if (playLockRef.current) {
          const t = state.track_window?.current_track;
          if (t) setCurrentTrack({ name: t.name, artists: (t.artists || []).map(a => a.name).join(', ') });
          return;
        }
        const t = state.track_window?.current_track;
        if (t) setCurrentTrack({ name: t.name, artists: (t.artists || []).map(a => a.name).join(', ') });
        setPlaying(!state.paused);
      });

      player.connect();
      playerRef.current = player;
    };

    window.onSpotifyWebPlaybackSDKReady = initPlayer;
    if (window.Spotify) initPlayer();

    // No cleanup on screen change — SDK should persist for the user's session
  }, [user]);

  // Crackle / scratch SFX
  const ensureTone = async () => {
    if (toneRef.current) return toneRef.current;
    const Tone = await import('tone');
    await Tone.start();
    toneRef.current = Tone;
    return Tone;
  };

  const startCrackle = async () => {
    try {
      const Tone = await ensureTone();
      if (noiseRef.current) return;
      if (crackleVol <= 0) return;
      // Master volume node — all crackle elements route through this so we can update live
      const master = new Tone.Volume(volFromSlider(crackleVol)).toDestination();

      // Layer 1: warm low-mid hiss (pink noise filtered)
      const hiss = new Tone.Noise('pink');
      const hissLP = new Tone.Filter(3200, 'lowpass');
      const hissHP = new Tone.Filter(300, 'highpass');
      const hissVol = new Tone.Volume(-2);
      hiss.chain(hissHP, hissLP, hissVol, master);
      hiss.start();

      // Layer 2: high-frequency surface crackle (very fine, fast clicks — sounds like a "crackle texture", not skips)
      // Use a slowly-modulated bandpass on white noise for a fizzing crackle texture
      const crackleNoise = new Tone.Noise('white');
      const crackleBP = new Tone.Filter(5200, 'bandpass');
      crackleBP.Q.value = 2.5;
      // LFO modulating the filter freq subtly so it doesn't sound static
      const lfo = new Tone.LFO({ frequency: 0.3, min: 4200, max: 6800 });
      lfo.connect(crackleBP.frequency);
      lfo.start();
      // Random amplitude modulation to make it "crackle" rather than be a flat hiss
      const crackleAM = new Tone.Tremolo({ frequency: 14, depth: 0.85, type: 'square' }).start();
      const crackleAM2 = new Tone.Tremolo({ frequency: 3.7, depth: 0.4 }).start();
      const crackleVolNode = new Tone.Volume(-6);
      crackleNoise.chain(crackleBP, crackleAM, crackleAM2, crackleVolNode, master);
      crackleNoise.start();

      noiseRef.current = { hiss, hissLP, hissHP, hissVol, crackleNoise, crackleBP, lfo, crackleAM, crackleAM2, crackleVolNode, master };
    } catch (e) { console.warn('crackle failed', e); }
  };

  const stopCrackle = () => {
    try {
      const r = noiseRef.current;
      if (r) {
        r.hiss.stop(); r.hiss.dispose();
        r.hissLP.dispose(); r.hissHP.dispose(); r.hissVol.dispose();
        r.crackleNoise.stop(); r.crackleNoise.dispose();
        r.crackleBP.dispose();
        try { r.lfo.stop(); r.lfo.dispose(); } catch { }
        try { r.crackleAM.stop(); r.crackleAM.dispose(); } catch { }
        try { r.crackleAM2.stop(); r.crackleAM2.dispose(); } catch { }
        r.crackleVolNode.dispose();
        r.master.dispose();
      }
    } catch { }
    noiseRef.current = null;
  };

  // Map slider 0..100 to dB. 0 = silent, 50 = -22db, 100 = 0db.
  const volFromSlider = (v) => {
    if (v <= 0) return -Infinity;
    return -44 + (v / 100) * 44;
  };

  // Live-adjust crackle volume when slider moves — smoother ramp
  useEffect(() => {
    if (!noiseRef.current) {
      if (crackleVol > 0 && playing) startCrackle();
      return;
    }
    if (crackleVol <= 0) {
      stopCrackle();
      return;
    }
    try {
      // Longer, exponential-style ramp = ultra-smooth perceived fade
      noiseRef.current.master.volume.rampTo(volFromSlider(crackleVol), 0.22);
    } catch { }
  }, [crackleVol]);

  const playScratchSFX = async () => {
    try {
      const Tone = await ensureTone();
      const noise = new Tone.Noise('white');
      const env = new Tone.AmplitudeEnvelope({ attack: 0.002, decay: 0.18, sustain: 0, release: 0.12 });
      const filter = new Tone.Filter(1800, 'bandpass');
      filter.Q.value = 1.5;
      const vol = new Tone.Volume(-14);
      noise.chain(filter, env, vol, Tone.Destination);
      noise.start();
      env.triggerAttackRelease(0.22);
      setTimeout(() => {
        try { noise.stop(); noise.dispose(); env.dispose(); filter.dispose(); vol.dispose(); } catch { }
      }, 700);
    } catch { }
  };

  // Preview audio (HTML5)
  const stopPreview = () => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    } catch { }
  };

  const playPreviewFrom = (idx) => {
    if (!playlistDetail) return false;
    const tracks = playlistDetail.tracks;
    // find next track with preview_url starting from idx
    for (let i = 0; i < tracks.length; i++) {
      const j = (idx + i) % tracks.length;
      if (tracks[j].preview_url) {
        stopPreview();
        const a = new Audio(tracks[j].preview_url);
        a.volume = 0.85;
        a.onended = () => {
          const nextIdx = (j + 1) % tracks.length;
          setPreviewIdx(nextIdx);
          playPreviewFrom(nextIdx);
        };
        a.play().catch(() => { });
        audioRef.current = a;
        setCurrentTrack({ name: tracks[j].name, artists: tracks[j].artists });
        setPreviewIdx(j);
        return true;
      }
    }
    return false;
  };

  const togglePlay = async () => {
    // ── Strict guard against double-firing ──
    if (playLockRef.current) return;
    playLockRef.current = true;
    setIsTransitioning(true);

    try {
      const next = !playing;

      if (next) {
        // Set spinning immediately for instant tactile feedback
        setPlaying(true);
        // Tonearm drop sequence (1.5s CSS) — schedule SFX to land with the stylus
        setTimeout(() => { if (playLockRef.current !== false) playScratchSFX(); }, 1300);
        if (crackleVol > 0) setTimeout(() => startCrackle(), 1500);

        // Premium playback
        if (user?.product === 'premium' && sdkReady && sdkDeviceId && playlist?.uri && playerRef.current) {
          setPlayMode('premium');
          try {
            if (playerRef.current.activateElement) {
              await playerRef.current.activateElement();
            }
          } catch { }

          // RESUME PATH: if we already started this playlist in this session and the SDK still has state, just resume
          const sameContext = playedContextRef.current === playlist.uri;
          let resumed = false;
          if (sameContext) {
            try {
              await playerRef.current.resume();
              resumed = true;
            } catch { resumed = false; }
          }

          if (!resumed) {
            // First-time start (or context was lost) — initiate playlist from the top
            let r = await fetch('/api/play', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ device_id: sdkDeviceId, context_uri: playlist.uri }),
            });
            if (!r.ok) {
              await new Promise(res => setTimeout(res, 500));
              r = await fetch('/api/play', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: sdkDeviceId, context_uri: playlist.uri }),
              });
            }
            if (r.ok) {
              playedContextRef.current = playlist.uri;
            } else {
              const ok = playPreviewFrom(0);
              setPlayMode(ok ? 'preview' : 'silent');
            }
          }
        } else {
          // Preview mode — resume from last position if same track was paused
          if (playMode === 'preview' && audioRef.current && audioRef.current.src) {
            try {
              await audioRef.current.play();
            } catch {
              const ok = playlistDetail ? playPreviewFrom(previewPosRef.current.idx || 0) : false;
              setPlayMode(ok ? 'preview' : 'silent');
            }
          } else {
            const startIdx = previewPosRef.current.idx || 0;
            const ok = playlistDetail ? playPreviewFrom(startIdx) : false;
            // Restore play head if we have a recorded position
            if (ok && audioRef.current && previewPosRef.current.t > 0) {
              try { audioRef.current.currentTime = previewPosRef.current.t; } catch { }
            }
            setPlayMode(ok ? 'preview' : 'silent');
          }
        }
      } else {
        // PAUSE (NOT stop) — remember where we are so resume continues seamlessly
        setPlaying(false);
        stopCrackle();
        if (playMode === 'premium' && playerRef.current) {
          try {
            await playerRef.current.pause();
          } catch {
            // Fallback to REST pause
            fetch('/api/pause', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ device_id: sdkDeviceId }),
            }).catch(() => { });
          }
        } else if (playMode === 'preview' && audioRef.current) {
          // Record position before pausing
          try {
            previewPosRef.current = { idx: previewIdx, t: audioRef.current.currentTime || 0 };
            audioRef.current.pause();
          } catch { }
        }
        // Keep `currentTrack` and the audio element around so resume looks seamless
      }
    } finally {
      // Release after small grace period so SDK player_state_changed echo doesn't re-trigger
      setTimeout(() => {
        playLockRef.current = false;
        setIsTransitioning(false);
      }, 350);
    }
  };

  // Start playback of a specific track within the playlist context
  const playTrackAt = async (idx) => {
    if (playLockRef.current) return;
    if (!playlistDetail) return;
    const t = playlistDetail.tracks[idx];
    if (!t) return;
    playLockRef.current = true;
    setIsTransitioning(true);

    try {
      const wasStopped = !playing;
      if (wasStopped) {
        setPlaying(true);
        setTimeout(() => { playScratchSFX(); }, 1300);
        if (crackleVol > 0) setTimeout(() => startCrackle(), 1500);
      }
      // Immediate visual feedback: update current track display
      setCurrentTrack({ name: t.name, artists: t.artists });

      if (user?.product === 'premium' && sdkReady && sdkDeviceId && playlist?.uri && playerRef.current) {
        setPlayMode('premium');
        try {
          if (playerRef.current.activateElement) {
            await playerRef.current.activateElement();
          }
        } catch { }
        const body = t.uri
          ? { device_id: sdkDeviceId, context_uri: playlist.uri, offset_uri: t.uri }
          : { device_id: sdkDeviceId, context_uri: playlist.uri };
        let r = await fetch('/api/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          await new Promise(res => setTimeout(res, 500));
          r = await fetch('/api/play', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        }
        if (!r.ok) {
          const ok = playPreviewFrom(idx);
          setPlayMode(ok ? 'preview' : 'silent');
        } else {
          playedContextRef.current = playlist.uri;
        }
      } else {
        const ok = playPreviewFrom(idx);
        setPlayMode(ok ? 'preview' : 'silent');
      }
    } finally {
      setTimeout(() => {
        playLockRef.current = false;
        setIsTransitioning(false);
      }, 350);
    }
  };

  const skipNext = async () => {
    if (!playing) return;
    if (playMode === 'premium') {
      try {
        if (playerRef.current) await playerRef.current.nextTrack();
        else await fetch('/api/next', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: sdkDeviceId }) });
      } catch { }
    } else if (playMode === 'preview' && playlistDetail) {
      const n = (previewIdx + 1) % playlistDetail.tracks.length;
      playPreviewFrom(n);
    }
  };

  const skipPrev = async () => {
    if (!playing) return;
    if (playMode === 'premium') {
      try {
        if (playerRef.current) await playerRef.current.previousTrack();
        else await fetch('/api/previous', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ device_id: sdkDeviceId }) });
      } catch { }
    } else if (playMode === 'preview' && playlistDetail) {
      const n = (previewIdx - 1 + playlistDetail.tracks.length) % playlistDetail.tracks.length;
      playPreviewFrom(n);
    }
  };

  const goBack = (dest) => {
    stopCrackle();
    stopPreview();
    if (playMode === 'premium' && sdkDeviceId && playing) {
      fetch('/api/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: sdkDeviceId }),
      }).catch(() => { });
    }
    setPlaying(false);
    setCurrentTrack(null);
    setPlayMode(null);
    setScreen(dest);
  };

  const filteredPlaylists = useMemo(() => {
    let list = playlists;
    if (filterOwned && user?.id) {
      list = list.filter(p => p.owner_id === user.id);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.owner || '').toLowerCase().includes(q)
      );
    }
    if (sortMode === 'az') {
      list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
    } else if (sortMode === 'za') {
      list = [...list].sort((a, b) => (b.name || '').localeCompare(a.name || '', undefined, { sensitivity: 'base' }));
    }
    return list;
  }, [playlists, search, filterOwned, user, sortMode]);

  // ── DRAG-TO-SPIN logic for the player disc ──
  const [discRot, setDiscRot] = useState(0);
  const discWrapRef = useRef(null);
  const dragState = useRef({ dragging: false, lastAngle: 0, movedDist: 0, lastMoveTs: 0, velocity: 0 });
  const rafRef = useRef(null);

  // Auto-spin loop while playing & not dragging
  useEffect(() => {
    if (screen !== 'player') return;
    let last = performance.now();
    const tick = (now) => {
      const dt = now - last;
      last = now;
      // 33⅓ RPM = 200 deg/sec — but we use a more cinematic ~138 deg/sec
      if (playing && !dragState.current.dragging) {
        setDiscRot(r => r + dt * 0.138);
      } else if (!playing && !dragState.current.dragging) {
        // Decay residual velocity from a recent fling
        if (Math.abs(dragState.current.velocity) > 0.001) {
          setDiscRot(r => r + dragState.current.velocity * dt);
          dragState.current.velocity *= 0.94; // friction
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [screen, playing]);

  const getDiscAngle = (clientX, clientY) => {
    if (!discWrapRef.current) return 0;
    const rect = discWrapRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI;
  };

  const onDiscPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragState.current.dragging = true;
    dragState.current.lastAngle = getDiscAngle(e.clientX, e.clientY);
    dragState.current.movedDist = 0;
    dragState.current.velocity = 0;
    dragState.current.lastMoveTs = performance.now();
  };

  const onDiscPointerMove = (e) => {
    const ds = dragState.current;
    if (!ds.dragging) return;
    const ang = getDiscAngle(e.clientX, e.clientY);
    let delta = ang - ds.lastAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    ds.movedDist += Math.abs(delta);
    ds.lastAngle = ang;
    const now = performance.now();
    const dt = Math.max(1, now - ds.lastMoveTs);
    ds.velocity = delta / dt; // deg per ms
    ds.lastMoveTs = now;
    setDiscRot(r => r + delta);
  };

  const onDiscPointerUp = (e) => {
    const ds = dragState.current;
    if (!ds.dragging) return;
    ds.dragging = false;
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch { }
    // Treat as click if barely moved
    if (ds.movedDist < 6) {
      togglePlay();
      ds.velocity = 0;
    }
  };

  const APP = {
    fontFamily: FF,
    background: '#080808',
    color: '#ddd',
    minHeight: '100vh',
  };

  /* ── CONNECT ── */
  if (screen === 'connect') {
    return (
      <div style={{ ...APP, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 24 : 40 }}>
        <div style={{ marginBottom: isMobile ? 36 : 56, textAlign: 'center', animation: 'fadeSlide 0.4s both' }}>
          <div style={{ fontSize: 11, letterSpacing: 7, color: '#444', marginBottom: 18 }}>
            VINYL OS · v1.2.0
          </div>
          <div style={{ fontSize: isMobile ? 52 : 72, fontWeight: 700, letterSpacing: -2.5, lineHeight: 0.88, color: '#e8e8e8' }}>
            CRATE<br /><span style={{ color: '#303030' }}>DIGGER</span>
          </div>
          <div style={{ width: 32, height: 2, background: '#e8e8e8', margin: '24px auto 0' }} />
          <div style={{ fontSize: 12, color: '#555', letterSpacing: 5, marginTop: 20 }}>
            YOUR PLAYLISTS · AS VINYL
          </div>
        </div>

        <button
          onClick={() => { window.location.href = '/api/auth/login'; }}
          style={{
            ...btn({ padding: isMobile ? '16px 28px' : '19px 44px', minWidth: isMobile ? '90%' : 360, textAlign: 'center', fontSize: 13 }),
            background: '#1DB954',
            color: '#080808',
            borderColor: '#1DB954',
            fontWeight: 700,
            animation: 'fadeSlide 0.4s 0.1s both',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1ed760'; e.currentTarget.style.borderColor = '#1ed760'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#1DB954'; e.currentTarget.style.borderColor = '#1DB954'; }}
        >
          ▶ CONNECT WITH SPOTIFY
        </button>

        <div style={{ marginTop: 22, fontSize: 11, color: '#444', letterSpacing: 3, animation: 'fadeSlide 0.4s 0.2s both' }}>
          OAUTH_2.0 · SECURE · PREMIUM_PLAYBACK_SUPPORTED
        </div>

        {authError && (
          <div style={{
            marginTop: 40, padding: 20, border: '1px solid #441111', background: '#160808',
            maxWidth: 600, animation: 'fadeSlide 0.4s both',
          }}>
            <div style={{ fontSize: 10, color: '#ff5544', letterSpacing: 3, marginBottom: 10 }}>
              ⚠ AUTHENTICATION FAILED
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginBottom: 12, lineHeight: 1.6 }}>
              Error code: <span style={{ color: '#ff7766' }}>{authError.error}</span>
              {authError.detail && (<><br />Detail: <span style={{ color: '#888', fontSize: 10 }}>{authError.detail}</span></>)}
            </div>
            <div style={{ fontSize: 10, color: '#666', lineHeight: 1.7, letterSpacing: 1 }}>
              MAKE SURE THIS EXACT REDIRECT URI IS REGISTERED IN YOUR SPOTIFY APP DASHBOARD:
            </div>
            <div style={{
              marginTop: 8, padding: '10px 12px', background: '#0a0a0a', border: '1px solid #222',
              fontFamily: FF, fontSize: 11, color: '#1DB954', wordBreak: 'break-all',
            }}>
              {redirectUri || '...'}
            </div>
            <a
              href="https://developer.spotify.com/dashboard"
              target="_blank" rel="noreferrer"
              style={{ display: 'inline-block', marginTop: 14, fontSize: 10, letterSpacing: 2, color: '#ddd', textDecoration: 'underline' }}
            >→ OPEN SPOTIFY DASHBOARD</a>
          </div>
        )}
      </div>
    );
  }

  /* ── LIBRARY ── */
  if (screen === 'library') {
    // On mobile, allow 1 or 2 columns (matching the mobile-only GRID buttons).
    // On tablet, cap at 2. On desktop, honor whatever the user picked.
    const effGridCols = isMobile
      ? Math.min(Math.max(gridCols, 1), 2)
      : isNarrow ? Math.min(gridCols, 2) : gridCols;
    return (
      <div style={{ ...APP, padding: isMobile ? '24px 12px' : '36px 48px', animation: 'fadeSlide 0.35s both' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: isMobile ? 24 : 40, gap: 24, flexWrap: 'wrap' }}>
          <div>
            <button
              onClick={() => {
                // Full client-side cleanup before navigating to backend logout
                try { stopCrackle(); } catch { }
                try { stopPreview(); } catch { }
                try { playerRef.current?.disconnect(); } catch { }
                playerRef.current = null;
                playLockRef.current = false;
                setPlaying(false);
                setUser(null);
                setPlaylists([]);
                setPlaylist(null);
                setPlaylistDetail(null);
                setCurrentTrack(null);
                setSdkReady(false);
                setSdkDeviceId(null);
                setPlayMode(null);
                window.location.href = '/api/auth/logout';
              }}
              style={{ ...btn({ border: 'none', fontSize: 12, letterSpacing: 2.5, padding: '4px 0', marginBottom: 14, color: '#555' }) }}
              onMouseEnter={e => e.currentTarget.style.color = '#ddd'}
              onMouseLeave={e => e.currentTarget.style.color = '#555'}
            >← DISCONNECT</button>
            <div style={{ fontSize: 11, color: '#5a5a5a', letterSpacing: 4 }}>
              SPOTIFY · {user?.display_name?.toUpperCase() || 'YOUR'} LIBRARY
              {user?.product && (
                <span style={{ marginLeft: 14, color: user.product === 'premium' ? '#1DB954' : '#666' }}>
                  · {user.product.toUpperCase()}
                </span>
              )}
            </div>
            <h2 style={{ fontSize: isMobile ? 30 : 44, fontWeight: 700, letterSpacing: -1.5, marginTop: 10, color: '#e8e8e8' }}>
              YOUR CRATES
            </h2>
          </div>

          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: isMobile ? 'stretch' : 'flex-end',
            gap: 12,
            width: isMobile ? '100%' : 'auto',
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="SEARCH CRATES..."
              style={{
                background: 'transparent',
                border: '1px solid #1e1e1e',
                borderBottom: '1px solid #333',
                color: '#ddd',
                fontFamily: FF,
                fontSize: 13,
                letterSpacing: 2,
                padding: '10px 14px',
                outline: 'none',
                width: isMobile ? '100%' : 280,
                boxSizing: 'border-box',
              }}
              onFocus={e => e.currentTarget.style.borderBottomColor = '#e8e8e8'}
              onBlur={e => e.currentTarget.style.borderBottomColor = '#333'}
            />
            <button
              onClick={() => setFilterOwned(v => !v)}
              style={{
                ...btn({
                  padding: '8px 16px',
                  fontSize: 11,
                  letterSpacing: 3,
                  border: '1px solid ' + (filterOwned ? '#e8e8e8' : '#252525'),
                  color: filterOwned ? '#080808' : '#999',
                  background: filterOwned ? '#e8e8e8' : 'transparent',
                }),
                transition: 'all 0.18s ease',
              }}
              title="Show only playlists you created"
            >
              {filterOwned ? '● BY YOU' : '○ BY YOU'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: '#5a5a5a', marginRight: 4 }}>SORT</span>
              {[
                { key: 'default', label: 'RECENT' },
                { key: 'az', label: 'A–Z' },
                { key: 'za', label: 'Z–A' },
              ].map(opt => {
                const active = sortMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSortMode(opt.key)}
                    style={{
                      ...btn({
                        padding: '6px 10px',
                        fontSize: 10,
                        letterSpacing: 2,
                        border: '1px solid ' + (active ? '#e8e8e8' : '#252525'),
                        color: active ? '#080808' : '#999',
                        background: active ? '#e8e8e8' : 'transparent',
                      }),
                      transition: 'all 0.18s ease',
                    }}
                    title={opt.key === 'default' ? 'Most recent first' : opt.key === 'az' ? 'Sort A to Z' : 'Sort Z to A'}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: 3, color: '#5a5a5a', marginRight: 4 }}>GRID</span>
              {(isMobile ? [1, 2] : [1, 2, 3, 4]).map(n => {
                const active = effGridCols === n;
                return (
                  <button
                    key={n}
                    onClick={() => setGridCols(n)}
                    style={{
                      ...btn({
                        padding: '6px 0',
                        width: 28,
                        fontSize: 11,
                        letterSpacing: 1,
                        border: '1px solid ' + (active ? '#e8e8e8' : '#252525'),
                        color: active ? '#080808' : '#999',
                        background: active ? '#e8e8e8' : 'transparent',
                      }),
                      transition: 'all 0.18s ease',
                    }}
                    title={`${n} per row`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {(() => {
          const mobile2Col = isMobile && effGridCols === 2;
          const libGap = effGridCols >= 3
            ? '48px 32px'
            : mobile2Col
              ? '28px 10px' // tighter on mobile 2-col
              : isMobile
                ? '40px 0'
                : '64px 48px';
          const libMaxW = effGridCols === 1
            ? (isMobile ? '100%' : 360)
            : effGridCols === 2
              ? (mobile2Col ? '100%' : 1100)
              : effGridCols === 3 ? 1280 : 1500;
          const vinylSize = mobile2Col ? 130 : (isMobile ? 220 : 280);
          // Cell title max width: smaller on mobile 2-col to clip long names
          const titleMaxW = mobile2Col ? vinylSize + 10 : 320;
          const titleFontSize = mobile2Col ? 11 : 14;
          const ownerFontSize = mobile2Col ? 9 : 11;
          // Truncate very long playlist names on mobile 2-col so they fit
          const truncateName = (name) => {
            if (!mobile2Col) return name;
            const max = 18;
            if (!name) return '';
            return name.length > max ? name.slice(0, max - 1).trimEnd() + '…' : name;
          };
          // Each card: tighter padding + left-bias alignment on mobile 2-col
          const cardAlign = mobile2Col ? 'flex-start' : 'center';
          const cardGap = mobile2Col ? 12 : 20;
          const cardTextAlign = mobile2Col ? 'left' : 'center';
          return (
        <>
        {loadingLib && playlists.length === 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${effGridCols}, 1fr)`,
            gap: libGap,
            maxWidth: libMaxW,
            margin: '0 auto',
            justifyItems: mobile2Col ? 'start' : 'stretch',
          }}>
            {Array.from({ length: Math.max(effGridCols * 2, 4) }).map((_, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: cardAlign, gap: cardGap }}>
                <div style={{
                  width: vinylSize, height: vinylSize, borderRadius: '50%',
                  background: 'radial-gradient(circle, #131313 0%, #0a0a0a 70%)',
                  animation: 'pulse-text 1.6s ease-in-out infinite',
                }} />
                <div style={{ width: vinylSize * 0.6, height: 10, background: '#151515' }} />
              </div>
            ))}
          </div>
        )}

        {!loadingLib && filteredPlaylists.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#666', fontSize: 13, letterSpacing: 2 }}>
            {search ? 'NO MATCHES' : 'NO PLAYLISTS FOUND IN YOUR SPOTIFY LIBRARY'}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${effGridCols}, 1fr)`,
          gap: libGap,
          maxWidth: libMaxW,
          margin: '0 auto',
          justifyItems: mobile2Col ? 'start' : 'stretch',
        }}>
          {filteredPlaylists.map((p, i) => {
            const col = colors[p.id];
            return (
              <div
                key={p.id}
                onClick={() => { setPlaylist(p); setScreen('player'); }}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: cardAlign, gap: cardGap,
                  cursor: 'pointer',
                  animation: `fadeSlide 0.4s ${Math.min(i, 12) * 0.04}s both`,
                  minWidth: 0, // allow grid cell to shrink so ellipsis can work
                  width: '100%',
                }}
              >
                <VinylDisc pl={p} size={vinylSize} spin={false} color={col} />
                <div style={{ textAlign: cardTextAlign, maxWidth: titleMaxW, minWidth: 0, width: '100%' }}>
                  <div style={{
                    fontSize: titleFontSize, fontWeight: 700, letterSpacing: mobile2Col ? 1.5 : 2.5,
                    color: '#e8e8e8',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {truncateName(p.name)}
                  </div>
                  <div style={{
                    fontSize: ownerFontSize,
                    color: '#5a5a5a',
                    letterSpacing: mobile2Col ? 1.5 : 2,
                    marginTop: mobile2Col ? 4 : 8,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {(p.owner || '').toUpperCase()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </>
          );
        })()}
      </div>
    );
  }

  /* ── PLAYER ── */
  const pl = playlist;
  const col = colors[pl?.id];
  const accent = col ? col.bright : colorsFromId(pl?.id || 'x')[1];
  // Only show duration for playlists owned by the user (foreign playlists' tracks
  // are often blocked by Spotify dev quota → duration would be misleading)
  const isOwnPlaylist = pl?.owner_id && user?.id && pl.owner_id === user.id;
  const dur = (isOwnPlaylist && playlistDetail && playlistDetail.duration_ms > 0)
    ? msToDur(playlistDetail.duration_ms)
    : '—';
  // Prefer Spotify's reported total (most accurate), fall back to loaded tracks, then library count
  const trackCount = playlistDetail?.total_reported
    || playlistDetail?.track_count
    || pl?.tracks
    || 0;
  const isPremium = user?.product === 'premium';

  const fmtTrackTime = (ms) => {
    if (!ms) return '';
    const total = Math.floor(ms / 1000);
    const mm = Math.floor(total / 60);
    const ss = total % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  };

  // Build the header stats — drop DURATION entirely for foreign playlists
  const headerStats = isOwnPlaylist
    ? [['RPM', '33⅓'], ['DURATION', dur], ['MODE', isPremium ? (sdkReady ? 'PREMIUM' : 'INIT...') : 'PREVIEW']]
    : [['RPM', '33⅓'], ['MODE', isPremium ? (sdkReady ? 'PREMIUM' : 'INIT...') : 'PREVIEW']];

  return (
    <div style={{ ...APP, display: 'flex', flexDirection: 'column', padding: isMobile ? '20px 18px' : '30px 52px', minHeight: '100vh', animation: 'fadeSlide 0.35s both' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={() => goBack('library')}
          style={{ ...btn({ border: 'none', fontSize: 12, letterSpacing: 2.5, padding: '4px 0', color: '#555' }) }}
          onMouseEnter={e => e.currentTarget.style.color = '#ddd'}
          onMouseLeave={e => e.currentTarget.style.color = '#555'}
        >← LIBRARY</button>

        <div style={{ display: 'flex', gap: isMobile ? 18 : 44, fontSize: 12, letterSpacing: 2, flexWrap: 'wrap' }}>
          {headerStats.map(([lbl, val]) => (
            <div key={lbl}>
              <div style={{ color: '#444', marginBottom: 4, fontSize: isMobile ? 9 : 11 }}>{lbl}</div>
              <div style={{ fontWeight: 700, color: '#e8e8e8', fontSize: isMobile ? 11 : 13 }}>{val}</div>
            </div>
          ))}
          <div>
            <div style={{ color: '#444', marginBottom: 4, fontSize: isMobile ? 9 : 11 }}>STATUS</div>
            <div style={{
              fontWeight: 700,
              fontSize: isMobile ? 11 : 13,
              color: playing ? accent : '#5a5a5a',
              animation: playing ? 'pulse-text 1.8s ease-in-out infinite' : 'none',
            }}>
              {playing ? '▶ PLAYING' : '■ STOPPED'}
            </div>
          </div>
        </div>
      </div>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: isNarrow ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: isNarrow ? 'flex-start' : 'space-between',
        gap: isNarrow ? 28 : 40,
        marginTop: isMobile ? 8 : 0,
      }}>
        <div
          ref={discWrapRef}
          onPointerDown={onDiscPointerDown}
          onPointerMove={onDiscPointerMove}
          onPointerUp={onDiscPointerUp}
          onPointerCancel={onDiscPointerUp}
          style={{
            position: 'relative',
            flexShrink: 0,
            cursor: dragState.current.dragging ? 'grabbing' : 'grab',
            touchAction: 'none',
            // leave room for the tonearm SVG (scaled) to the right
            paddingRight: isMobile ? 22 : 0,
            paddingTop: isMobile ? 12 : 0,
          }}
        >
          <VinylDisc pl={pl} size={isMobile ? 200 : isNarrow ? 340 : 460} spin={playing} color={col} rotation={discRot} />
          <Tonearm playing={playing} scale={isMobile ? 0.5 : isNarrow ? 0.78 : 1} />
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: isMobile ? 20 : 28, maxWidth: 540, width: isNarrow ? '100%' : undefined }}>
          <div>
            <div style={{ fontSize: 11, color: '#444', letterSpacing: 5, marginBottom: 14 }}>
              {(pl?.owner || '').toUpperCase()}
            </div>
            <h1 style={{ fontSize: isMobile ? 30 : 44, fontWeight: 700, letterSpacing: -1.5, lineHeight: 0.95, color: '#e8e8e8', marginBottom: 16, textTransform: 'uppercase' }}>
              {pl?.name}
            </h1>
            <div style={{ fontSize: 11, color: '#5a5a5a', letterSpacing: 2.5 }}>
              SPOTIFY
            </div>
          </div>

          {/* Now playing line — persists while paused so the song info doesn't disappear */}
          {currentTrack && (
            <div style={{
              padding: '10px 0',
              borderTop: `1px solid ${playing ? accent : '#2a2a2a'}`,
              borderBottom: '1px solid #1e1e1e',
              animation: 'fadeSlide 0.3s both',
              opacity: playing ? 1 : 0.85,
              transition: 'border-color 0.25s ease, opacity 0.25s ease',
            }}>
              <div style={{ fontSize: 9, color: '#444', letterSpacing: 3, marginBottom: 4 }}>
                {playing ? 'NOW PLAYING' : '❚❚ PAUSED'}
              </div>
              <div style={{ fontSize: 13, color: playing ? accent : '#aaa', fontWeight: 700, letterSpacing: 1, transition: 'color 0.25s ease' }}>
                {currentTrack.name}
              </div>
              <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>{currentTrack.artists}</div>
            </div>
          )}

          <div style={{ width: 36, height: 1, background: '#1e1e1e' }} />

          {/* Transport controls: PREV | PLAY/STOP | NEXT */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={skipPrev}
              disabled={!playing || isTransitioning}
              style={{
                ...btn({ padding: '14px 16px', width: 56, textAlign: 'center', fontSize: 14 }),
                opacity: playing && !isTransitioning ? 1 : 0.35,
                cursor: playing && !isTransitioning ? 'pointer' : 'not-allowed',
              }}
              title="Previous"
            >
              ⏮
            </button>
            <button
              onClick={togglePlay}
              disabled={isTransitioning}
              style={{
                ...btn({ padding: '14px 28px', flex: 1, textAlign: 'left', maxWidth: 240, fontSize: 12 }),
                borderColor: playing ? accent : '#252525',
                color: playing ? accent : '#ddd',
                opacity: isTransitioning ? 0.6 : 1,
                cursor: isTransitioning ? 'wait' : 'pointer',
                transition: 'border-color 0.18s ease, color 0.18s ease, opacity 0.18s ease',
              }}
            >
              {isTransitioning ? '[ ... ]' : (playing ? '[ STOP_VINYL ]' : '[ PLAY_VINYL ]')}
            </button>
            <button
              onClick={skipNext}
              disabled={!playing || isTransitioning}
              style={{
                ...btn({ padding: '14px 16px', width: 56, textAlign: 'center', fontSize: 14 }),
                opacity: playing && !isTransitioning ? 1 : 0.35,
                cursor: playing && !isTransitioning ? 'pointer' : 'not-allowed',
              }}
              title="Next"
            >
              ⏭
            </button>
          </div>

          <button
            onClick={() => {
              setCrackleVol(v => v > 0 ? 0 : 45);
            }}
            style={{ ...btn({ border: 'none', padding: 0, fontSize: 9, letterSpacing: 3, color: crackleVol > 0 ? '#555' : '#2a2a2a', textAlign: 'left', display: 'none' }) }}
          >
            HIDDEN_LEGACY
          </button>

          {/* CRACKLE SLIDER */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 380 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: crackleVol > 0 ? '#999' : '#3a3a3a', letterSpacing: 3 }}>
                VINYL CRACKLE
              </span>
              <span style={{
                fontSize: 12,
                color: crackleVol > 0 ? accent : '#3a3a3a',
                letterSpacing: 2,
                fontWeight: 700,
                minWidth: 48,
                textAlign: 'right',
              }}>
                {crackleVol === 0 ? 'OFF' : `${crackleVol}%`}
              </span>
            </div>
            <input
              type="range"
              className="vinyl-slider"
              min={0}
              max={100}
              step={1}
              value={crackleVol}
              onChange={e => setCrackleVol(Number(e.target.value))}
              style={{
                '--vinyl-accent': accent,
                '--vinyl-pct': `${crackleVol}%`,
              }}
            />
          </div>

          {!isPremium && (
            <div style={{ fontSize: 11, color: '#666', letterSpacing: 2, lineHeight: 1.7 }}>
              FREE ACCOUNT · PLAYING 30s PREVIEWS · UPGRADE TO PREMIUM FOR FULL TRACKS
            </div>
          )}
          {sdkError && (
            <div style={{ fontSize: 11, color: '#ff5544', letterSpacing: 2 }}>SDK: {sdkError}</div>
          )}

          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 11, color: '#252525', letterSpacing: 2 }}>CLICK OR DRAG DISC TO INTERACT</div>
          </div>
        </div>
      </div>

      {/* ── FULL-WIDTH TRACKLIST (compact) ── */}
      {playlistDetail && playlistDetail.tracks.length > 0 && (
        <div style={{ marginTop: 44, paddingBottom: 60 }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            paddingBottom: 10, borderBottom: '1px solid #1e1e1e', marginBottom: 4,
          }}>
            <div style={{ fontSize: 11, letterSpacing: 4, color: '#888' }}>TRACKLIST</div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: accent, fontWeight: 700 }}>A-SIDE</div>
          </div>

          <div>
            {playlistDetail.tracks.map((t, idx) => {
              const isCurrent = currentTrack && currentTrack.name === t.name;
              return (
                <div
                  key={idx}
                  onClick={() => playTrackAt(idx)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '24px 1fr 48px' : '36px 1fr 64px',
                    alignItems: 'center',
                    gap: isMobile ? 10 : 18,
                    padding: '10px 10px 10px 0',
                    borderBottom: '1px solid #161616',
                    cursor: 'pointer',
                    transition: 'background 0.12s, padding-left 0.18s',
                    background: isCurrent ? 'rgba(255,255,255,0.025)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                    e.currentTarget.style.paddingLeft = '8px';
                  }}
                  onMouseLeave={e => {
                    if (!isCurrent) e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.paddingLeft = '0';
                  }}
                >
                  <span style={{
                    fontSize: 11,
                    fontFamily: FF,
                    color: isCurrent ? accent : '#5a5a5a',
                    letterSpacing: 1,
                  }}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
                    <span style={{
                      fontSize: 14,
                      fontWeight: 400,
                      color: isCurrent ? accent : '#e0e0e0',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: '60%',
                    }}>
                      {t.name}{t.is_local ? ' · [LOCAL]' : ''}
                    </span>
                    <span style={{
                      fontSize: 12,
                      color: '#666',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      flex: 1,
                    }}>
                      {t.artists}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 11,
                    color: isCurrent ? accent : '#5a5a5a',
                    textAlign: 'right',
                    fontFamily: FF,
                  }}>
                    {t.duration_ms > 0 ? fmtTrackTime(t.duration_ms) : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {playlistDetail && playlistDetail.tracks.length === 0 && null}
    </div>
  );
}

export default App;
