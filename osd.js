/* osd.js — OSD9TDJ (playlist + épée)
   - Playlist: shuffle sans répétition (même page 1h => ça varie)
   - Anti-superposition: singleton + lock global (onglets/fenêtres) + pause sur sortie
   - Google Translate: nouvelle fenêtre => ancienne perd focus => pause (blur court dropdown ignoré)
   - Épée: uniquement sur click (pas scroll)
   - CHECK AUTO: supprime automatiquement les pistes MP3 introuvables (404/etc.)
   - FIX chemins: normalisation via document.baseURI (corrige GitHub Pages /repo/)
   - Robustesse: skip sur ended/error/stalled + watchdog anti-blocage
*/
(() => {
  "use strict";

  // ===== SINGLETON (évite double init sur même page) =====
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) return;

  // ===== CONFIG =====
  // Conseil: chemins RELATIFS (sans "/" au début). On normalise quand même.
  // Ordre “thématique” conservé mais la lecture est shuffle (anti-répétition).
  let TRACKS = [
    // ⚔️ AGRESSIF / GUERRE (début)
    "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
    "/paulyudin-epic-485934.mp3",
    "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",

    // ⚔️ ÉPIQUE CINÉ / CHEVALERIE
    "/sigmamusicart-epic-cinematic-background-music-484595.mp3",
    "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
    "/deuslower-fantasy-medieval-epic-music-239599.mp3",

    // 🏰 MÉDIÉVAL / AMBIANCES (AJOUT racine)
    "/tunetank-medieval-festive-music-412772.mp3",
    "/tunetank-medieval-happy-music-412790.mp3",
    "/kaazoom-the-knight-and-the-flame-medieval-minstrelx27s-ballad-363292.mp3",
    "/medieval_horizons-medieval-horizons-quiet-repose-470879.mp3",

    // ✝️ TRANSITION SACRÉE (entrée liturgique)
    "/fideascende-crux-bellum-vox-325218.mp3",
    "/fideascende-crux-invicta-325224.mp3",
    "/fideascende-sanguis-dei-325211.mp3",

    // ✝️ AJOUTS FIDEASCENDE (racine)
    "/fideascende-regnum-dei-325214.mp3",
    "/fideascende-vox-vindictae-325213.mp3",
    "/fideascende-domine-miserere-325207.mp3",
    "/fideascende-domine-miserere-325207 (1).mp3",
    "/fideascende-in-tempore-sancti-bellatoris-325217.mp3",

    // ✝️ GRÉGORIEN PROFOND
    "/nickpanek-act-of-contrition-latin-gregorian-chant-340859.mp3",
    "/nickpanek-gregorian-chant-regina-caeli-prayer-340861.mp3",
    "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3",

    // ✝️ FIN MYSTIQUE
    "/fideascende-pater-noster-324805.mp3"

    // (doublon volontaire possible, mais INUTILE avec shuffle — à éviter)
    // "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3"
  ];

  const SWORD_SRC = "/sons/epee.mp3";

  const BGM_VOLUME = 0.40;
  const SWORD_VOLUME = 0.90;

  // sessionStorage (par onglet)
  const K_UNLOCKED = "osd_audio_unlocked";

  // shuffle order (par onglet)
  const K_ORDER = "osd_playlist_order";
  const K_POS = "osd_playlist_pos";

  // lock global (entre fenêtres/onglets)
  const LOCK_KEY = "osd_audio_lock";
  const CHANNEL_NAME = "osd_audio_channel";
  const instanceId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // sécurité: si un lock reste coincé (crash/kill), au bout de X ms on le considère "stale"
  const STALE_LOCK_MS = 15_000;

  // blur anti-dropdown: délai avant pause
  const BLUR_PAUSE_DELAY_MS = 300;

  // CHECK AUTO: timeout d’un check de piste (ms)
  const TRACK_CHECK_TIMEOUT_MS = 3500;

  // watchdog anti-stall
  const WATCHDOG_TICK_MS = 2000;
  const WATCHDOG_STUCK_MS = 10_000;

  // ===== UTILS =====
  function playlistLen() {
    return Array.isArray(TRACKS) ? TRACKS.length : 0;
  }

  // Normalise les URLs (corrige GitHub Pages /repo/ + évite racine foireuse)
  function toAbs(url) {
    // accepte "/x.mp3" ou "x.mp3" => devient absolu via baseURI
    const clean = String(url || "").replace(/^\//, "");
    return new URL(clean, document.baseURI).href;
  }

  function markUnlocked() {
    try {
      sessionStorage.setItem(K_UNLOCKED, "1");
    } catch {}
  }
  function isUnlocked() {
    try {
      return sessionStorage.getItem(K_UNLOCKED) === "1";
    } catch {
      return false;
    }
  }

  function ensureAudioEl(id) {
    // supprime doublons éventuels
    const all = document.querySelectorAll(`#${CSS.escape(id)}`);
    if (all.length > 1) {
      all.forEach((n, idx) => {
        if (idx === 0) return;
        try {
          n.pause();
        } catch {}
        try {
          n.remove();
        } catch {}
      });
    }
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.preload = "auto";
      el.playsInline = true;
      el.style.display = "none";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function withTimeout(ms, fn) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    return Promise.resolve()
      .then(() => fn(ctrl.signal))
      .finally(() => clearTimeout(t));
  }

  // ===== CHECK AUTO DES PISTES (supprime celles qui ne répondent pas) =====
  async function checkOneTrack(url) {
    const abs = toAbs(url);

    // 1) HEAD (peut échouer selon config serveur)
    try {
      const ok = await withTimeout(TRACK_CHECK_TIMEOUT_MS, (signal) =>
        fetch(abs, { method: "HEAD", cache: "no-store", signal }).then((r) => r && r.ok)
      );
      if (ok) return true;
    } catch {}

    // 2) fallback GET Range 0-0 (ultra léger)
    try {
      const ok2 = await withTimeout(TRACK_CHECK_TIMEOUT_MS, (signal) =>
        fetch(abs, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
          cache: "no-store",
          signal
        }).then((r) => r && (r.ok || r.status === 206))
      );
      return !!ok2;
    } catch {
      return false;
    }
  }

  async function validateTracks() {
    if (!Array.isArray(TRACKS) || TRACKS.length === 0) return;

    // On évite de checker 2x la même URL
    const unique = Array.from(new Set(TRACKS));
    const results = await Promise.all(unique.map(async (u) => [u, await checkOneTrack(u)]));
    const okSet = new Set(results.filter(([, ok]) => ok).map(([u]) => u));

    const before = TRACKS.slice();
    TRACKS = before.filter((u) => okSet.has(u));

    // logs diagnostic
    try {
      console.log("[OSD] Tracks before:", before.length, "after:", TRACKS.length);
      const removed = before.filter((u) => !okSet.has(u));
      if (removed.length) console.warn("[OSD] Removed (unreachable):", removed);
    } catch {}

    // si l’ordre shuffle existait, il doit être recalculé (taille a changé)
    try {
      sessionStorage.removeItem(K_ORDER);
      sessionStorage.removeItem(K_POS);
    } catch {}
  }

  // ===== SHUFFLE SANS RÉPÉTITION (par onglet) =====
  function getOrder() {
    try {
      return JSON.parse(sessionStorage.getItem(K_ORDER) || "[]");
    } catch {
      return [];
    }
  }
  function setOrder(arr) {
    try {
      sessionStorage.setItem(K_ORDER, JSON.stringify(arr));
    } catch {}
  }
  function getPos() {
    try {
      return parseInt(sessionStorage.getItem(K_POS) || "0", 10) || 0;
    } catch {
      return 0;
    }
  }
  function setPos(n) {
    try {
      sessionStorage.setItem(K_POS, String(n));
    } catch {}
  }

  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function ensureShuffleOrder() {
    const L = playlistLen();
    if (!L) return;

    let order = getOrder();
    let pos = getPos();

    const valid =
      Array.isArray(order) &&
      order.length === L &&
      order.every((n) => Number.isInteger(n) && n >= 0 && n < L) &&
      Number.isInteger(pos) &&
      pos >= 0 &&
      pos < L; // <-- petit fix: évite pos == L (idx undefined)

    if (!valid) {
      order = fisherYates([...Array(L)].map((_, i) => i));
      pos = 0;
      setOrder(order);
      setPos(pos);
    }
  }

  function nextFromShuffle(lastIndexOrNull) {
    ensureShuffleOrder();
    const order = getOrder();
    let pos = getPos();

    let idx = order[pos];
    pos++;

    if (pos >= order.length) {
      const last = order[order.length - 1];
      let newOrder = fisherYates([...Array(order.length)].map((_, i) => i));

      // évite de recommencer par la même piste que la dernière
      if (newOrder.length > 1 && newOrder[0] === last) {
        [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
      }
      setOrder(newOrder);
      pos = 0;
    }

    // évite répétition immédiate si possible
    if (Number.isInteger(lastIndexOrNull) && order.length > 1 && idx === lastIndexOrNull) {
      ensureShuffleOrder();
      const order2 = getOrder();
      let pos2 = getPos();
      idx = order2[pos2];
      pos2++;
      if (pos2 >= order2.length) pos2 = 0;
      setPos(pos2);
      return idx;
    }

    setPos(pos);
    return idx;
  }

  // ===== AUDIO =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.volume = BGM_VOLUME;
  bgm.loop = false;

  const sword = ensureAudioEl("osd_sword");
  sword.src = toAbs(SWORD_SRC);
  sword.volume = SWORD_VOLUME;

  let currentTrackIndex = null; // index numérique dans TRACKS
  let skipping = false;

  function pauseBgm() {
    try {
      bgm.pause();
    } catch {}
  }

  function stopBgmHard() {
    try {
      bgm.pause();
    } catch {}
    try {
      bgm.currentTime = 0;
    } catch {}
  }

  function loadTrack(i) {
    if (!playlistLen()) return;
    currentTrackIndex = i;

    const src = TRACKS[currentTrackIndex];
    stopBgmHard();
    bgm.src = toAbs(src);
    bgm.setAttribute("data-track-index", String(currentTrackIndex));
  }

  async function playCurrent({ mutedStart } = { mutedStart: false }) {
    if (!playlistLen()) return false;
    try {
      bgm.volume = BGM_VOLUME;
    } catch {}
    bgm.muted = !!mutedStart;
    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  async function skipToNext(reason) {
    if (skipping) return;
    skipping = true;
    try {
      if (!playlistLen()) return;

      claimLock();
      if (!lockIsMine()) return; // respecte anti-superposition
      if (document.hidden) return; // pas de lecture en arrière-plan

      const nextIdx = nextFromShuffle(currentTrackIndex);
      loadTrack(nextIdx);

      const unlocked = isUnlocked();
      await playCurrent({ mutedStart: !unlocked });
      if (unlocked) bgm.muted = false;

      // debug
      try {
        console.log("[OSD] skipToNext:", reason, "=>", nextIdx);
      } catch {}
    } finally {
      skipping = false;
    }
  }

  // ===== GLOBAL LOCK (anti multi-fenêtre / translate / onglets) =====
  let bc = null;
  try {
    bc = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  } catch {
    bc = null;
  }

  function writeLock(owner) {
    try {
      localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, t: Date.now() }));
    } catch {}
  }

  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.owner || typeof obj.owner !== "string") return null;
      if (!obj.t || typeof obj.t !== "number") return null;
      if (Date.now() - obj.t > STALE_LOCK_MS) return null; // stale lock
      return obj;
    } catch {
      return null;
    }
  }

  function lockIsMine() {
    const lock = readLock();
    return lock && lock.owner === instanceId;
  }

  function claimLock() {
    writeLock(instanceId);
    if (bc) {
      try {
        bc.postMessage({ type: "CLAIM", owner: instanceId });
      } catch {}
    }
  }

  function handleClaim(owner) {
    if (!owner || owner === instanceId) return;
    pauseBgm();
  }

  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (msg && msg.type === "CLAIM") handleClaim(msg.owner);
    };
  }

  window.addEventListener("storage", (e) => {
    if (e.key !== LOCK_KEY) return;
    const lock = readLock();
    if (lock && lock.owner && lock.owner !== instanceId) pauseBgm();
  });

  // ===== EVENTS: fin/erreurs => piste suivante =====
  bgm.addEventListener("ended", () => skipToNext("ended"));

  ["error", "stalled", "abort", "emptied", "suspend"].forEach((ev) => {
    bgm.addEventListener(ev, () => skipToNext(ev));
  });

  // ===== WATCHDOG anti-stall (si currentTime n'avance pas) =====
  let lastT = 0;
  let stuckMs = 0;

  setInterval(() => {
    if (!bgm || !bgm.src) {
      lastT = 0;
      stuckMs = 0;
      return;
    }
    if (bgm.paused) {
      lastT = bgm.currentTime || 0;
      stuckMs = 0;
      return;
    }
    if (document.hidden) {
      stuckMs = 0;
      return;
    }

    const t = bgm.currentTime || 0;
    if (t <= lastT + 0.01) stuckMs += WATCHDOG_TICK_MS;
    else stuckMs = 0;

    lastT = t;

    if (stuckMs >= WATCHDOG_STUCK_MS) {
      stuckMs = 0;
      skipToNext("watchdog_stuck");
    }
  }, WATCHDOG_TICK_MS);

  // ===== START LOGIC =====
  async function startOnThisPage() {
    // 1) check automatique (une seule fois au boot de la page)
    await validateTracks();

    // 2) si plus rien -> on ne tente pas d’audio
    if (!playlistLen()) return;

    // 3) revendique lock et démarre
    claimLock();

    // 4) charge une première piste via shuffle
    const firstIdx = nextFromShuffle(null);
    loadTrack(firstIdx);

    const unlocked = isUnlocked();
    await playCurrent({ mutedStart: !unlocked });

    if (unlocked) bgm.muted = false;
  }

  // unlock audio au 1er geste
  async function unlockAudio() {
    markUnlocked();
    bgm.muted = false;

    claimLock();

    if (document.hidden) return;
    if (!lockIsMine()) return;

    if (bgm.paused) await playCurrent({ mutedStart: false });
  }

  // ===== STOP MUSIC ON EXIT/LOSS OF FOCUS =====
  let blurTimer = null;
  let wasPlayingBeforeBlur = false;

  function schedulePauseOnBlur() {
    wasPlayingBeforeBlur = !bgm.paused;

    if (blurTimer) clearTimeout(blurTimer);

    blurTimer = setTimeout(() => {
      blurTimer = null;
      const stillNoFocus = typeof document.hasFocus === "function" ? !document.hasFocus() : true;
      if (document.hidden || stillNoFocus) pauseBgm();
    }, BLUR_PAUSE_DELAY_MS);
  }

  window.addEventListener("blur", schedulePauseOnBlur, true);

  window.addEventListener(
    "focus",
    () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }

      if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur && lockIsMine() && bgm.paused) {
        try {
          bgm.play().catch(() => {});
        } catch {}
      }
    },
    true
  );

  // Changement d'onglet => hidden est fiable, on pause direct
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) pauseBgm();
    },
    true
  );

  window.addEventListener("pagehide", pauseBgm, true);
  window.addEventListener("beforeunload", pauseBgm, true);

  // si page restaurée via BFCache
  window.addEventListener(
    "pageshow",
    () => {
      if (document.hidden) return;
      if (!isUnlocked()) return;

      claimLock();
      if (!lockIsMine()) return;

      try {
        if (bgm.paused) bgm.play().catch(() => {});
      } catch {}
    },
    true
  );

  // ===== ÉPÉE UNIQUEMENT SUR CLICK (pas scroll) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted) return;

      // évite l’UI translate
      const t = e.target;
      if (t && t.closest) {
        if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame")) return;
      }

      playSword();
    },
    true
  );

  const firstGesture = async () => {
    await unlockAudio();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  // ===== BOOT =====
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startOnThisPage, { once: true });
  } else {
    startOnThisPage();
  }

  window.__OSD_AUDIO_SINGLETON__ = { alive: true, id: instanceId };
})();
