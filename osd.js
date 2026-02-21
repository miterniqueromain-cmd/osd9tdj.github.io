/* osd.js — OSD9TDJ (playlist + épée) — VERSION “ÇA MARCHE PARTOUT”
   Objectif: 0 lenteur + audio fiable (mobile/PC) + Google Translate OK

   ✅ Changements clés (par rapport à ta version qui ne fait plus de son) :
   1) On SUPPRIME totalement le “track check” réseau (fetch/HEAD/Range) => plus aucun blocage.
   2) On rend l’UNLOCK ultra robuste :
      - si déjà “unlocked” dans l’onglet, on tente play direct
      - sinon on tente autoplay MUET (souvent autorisé), puis on dé-mute au 1er geste
      - au 1er geste utilisateur, on force play() (dans le geste) => c’est le point critique.
   3) On garde :
      - lock global multi-onglets/fenêtres (anti superposition)
      - pause sur blur/visibilitychange/pagehide (Google Translate inclus)
      - épée UNIQUEMENT sur click (avec exclusion UI Translate)
*/

(() => {
  "use strict";

  // ===== SINGLETON (évite double init sur même page) =====
  if (window.__OSD_AUDIO_SINGLETON__ && window.__OSD_AUDIO_SINGLETON__.alive) return;

  // ===== CONFIG =====
  const TRACKS = [
    "/charlvera-legends-of-the-iron-cross_-a-symphony-of-war-and-glory-472348.mp3",
    "/paulyudin-epic-485934.mp3",
    "/charlvera-guardian-of-the-holy-land-epic-background-music-for-video-206639.mp3",
    "/sigmamusicart-epic-cinematic-background-music-484595.mp3",
    "/charlvera-knight-of-the-sacred-order-epic-background-music-for-video-206650.mp3",
    "/deuslower-fantasy-medieval-epic-music-239599.mp3",
    "/tunetank-medieval-festive-music-412772.mp3",
    "/tunetank-medieval-happy-music-412790.mp3",
    "/kaazoom-the-knight-and-the-flame-medieval-minstrelx27s-ballad-363292.mp3",
    "/medieval_horizons-medieval-horizons-quiet-repose-470879.mp3",
    "/fideascende-crux-bellum-vox-325218.mp3",
    "/fideascende-crux-invicta-325224.mp3",
    "/fideascende-sanguis-dei-325211.mp3",
    "/fideascende-regnum-dei-325214.mp3",
    "/fideascende-vox-vindictae-325213.mp3",
    "/fideascende-domine-miserere-325207.mp3",
    "/fideascende-domine-miserere-325207 (1).mp3",
    "/fideascende-in-tempore-sancti-bellatoris-325217.mp3",
    "/nickpanek-act-of-contrition-latin-gregorian-chant-340859.mp3",
    "/nickpanek-gregorian-chant-regina-caeli-prayer-340861.mp3",
    "/nickpanek-amo-te-gregorian-chant-in-latin-340860.mp3",
    "/fideascende-pater-noster-324805.mp3"
  ];

  const SWORD_SRC = "/sons/epee.mp3";
  const BGM_VOLUME = 0.40;
  const SWORD_VOLUME = 0.90;

  // sessionStorage (par onglet) : autorisation audio
  const K_UNLOCKED = "osd_audio_unlocked";

  // shuffle (par onglet)
  const K_ORDER = "osd_playlist_order";
  const K_POS = "osd_playlist_pos";

  // lock global (entre fenêtres/onglets)
  const LOCK_KEY = "osd_audio_lock";
  const CHANNEL_NAME = "osd_audio_channel";
  const instanceId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const STALE_LOCK_MS = 15_000;

  // pause blur (Google Translate / changement focus)
  const BLUR_PAUSE_DELAY_MS = 300;

  // watchdog anti-stall
  const WATCHDOG_TICK_MS = 2000;
  const WATCHDOG_STUCK_MS = 10_000;

  // ===== UTILS =====
  function playlistLen() {
    return Array.isArray(TRACKS) ? TRACKS.length : 0;
  }

  // Respecte "/..." (racine) ET "..." (relatif)
  function toAbs(url) {
    return new URL(String(url || ""), document.baseURI).href;
  }

  function markUnlocked() {
    try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {}
  }
  function isUnlocked() {
    try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; }
  }

  function ensureAudioEl(id) {
    const all = document.querySelectorAll(`#${CSS.escape(id)}`);
    if (all.length > 1) {
      all.forEach((n, idx) => {
        if (idx === 0) return;
        try { n.pause(); } catch {}
        try { n.remove(); } catch {}
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

  function safePause(a) {
    try { a.pause(); } catch {}
  }
  function safeStop(a) {
    try { a.pause(); } catch {}
    try { a.currentTime = 0; } catch {}
  }

  // ===== SHUFFLE SANS RÉPÉTITION =====
  function getOrder() {
    try { return JSON.parse(sessionStorage.getItem(K_ORDER) || "[]"); } catch { return []; }
  }
  function setOrder(arr) {
    try { sessionStorage.setItem(K_ORDER, JSON.stringify(arr)); } catch {}
  }
  function getPos() {
    try { return parseInt(sessionStorage.getItem(K_POS) || "0", 10) || 0; } catch { return 0; }
  }
  function setPos(n) {
    try { sessionStorage.setItem(K_POS, String(n)); } catch {}
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
      pos < L;

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

  // ===== AUDIO ELEMENTS =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.volume = BGM_VOLUME;
  bgm.loop = false;

  const sword = ensureAudioEl("osd_sword");
  sword.src = toAbs(SWORD_SRC);
  sword.volume = SWORD_VOLUME;

  let currentTrackIndex = null;
  let skipping = false;

  function loadTrack(i) {
    if (!playlistLen()) return;
    currentTrackIndex = i;
    safeStop(bgm);
    bgm.src = toAbs(TRACKS[currentTrackIndex]);
    bgm.setAttribute("data-track-index", String(currentTrackIndex));
    try { bgm.load(); } catch {}
  }

  async function tryPlayBgm({ mutedStart } = { mutedStart: false }) {
    if (!playlistLen()) return false;
    try { bgm.volume = BGM_VOLUME; } catch {}
    bgm.muted = !!mutedStart;

    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  // ===== GLOBAL LOCK (anti multi-fenêtre / onglets) =====
  let bc = null;
  try { bc = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { bc = null; }

  function writeLock(owner) {
    try { localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, t: Date.now() })); } catch {}
  }

  function readLock() {
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.owner || typeof obj.owner !== "string") return null;
      if (!obj.t || typeof obj.t !== "number") return null;
      if (Date.now() - obj.t > STALE_LOCK_MS) return null;
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
      try { bc.postMessage({ type: "CLAIM", owner: instanceId }); } catch {}
    }
  }

  function pauseBgm() {
    safePause(bgm);
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

  // ===== SKIP NEXT (robuste) =====
  async function skipToNext(reason) {
    if (skipping) return;
    skipping = true;
    try {
      if (!playlistLen()) return;

      claimLock();
      if (!lockIsMine()) return;
      if (document.hidden) return;

      const nextIdx = nextFromShuffle(currentTrackIndex);
      loadTrack(nextIdx);

      // si pas encore unlock: on peut jouer muet (autorisé), puis on dé-mute au 1er geste
      const unlocked = isUnlocked();
      const ok = await tryPlayBgm({ mutedStart: !unlocked });
      if (ok && unlocked) bgm.muted = false;

      try { console.log("[OSD] skipToNext:", reason, "=>", nextIdx); } catch {}
    } finally {
      skipping = false;
    }
  }

  // fin/erreurs => next
  bgm.addEventListener("ended", () => skipToNext("ended"));
  ["error", "stalled", "abort", "emptied", "suspend"].forEach((ev) => {
    bgm.addEventListener(ev, () => skipToNext(ev));
  });

  // ===== WATCHDOG anti-stall =====
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

  // ===== START (ultra robuste) =====
  async function startBgmSoft() {
    if (!playlistLen()) return;

    claimLock();
    if (!lockIsMine()) return;
    if (document.hidden) return;

    if (currentTrackIndex == null) {
      const firstIdx = nextFromShuffle(null);
      loadTrack(firstIdx);
    }

    const unlocked = isUnlocked();

    // 1) si déjà unlocked: tente play normal (souvent OK si l’utilisateur a déjà interagi dans l’onglet)
    if (unlocked) {
      const ok = await tryPlayBgm({ mutedStart: false });
      if (ok) return;
    }

    // 2) fallback: autoplay muet (souvent autorisé)
    await tryPlayBgm({ mutedStart: true });
  }

  // ===== UNLOCK AU 1ER GESTE (le point CRITIQUE) =====
  async function unlockAndForcePlay() {
    markUnlocked();

    claimLock();
    if (!lockIsMine()) return;
    if (document.hidden) return;

    // si aucune piste chargée (rare), charge maintenant
    if (currentTrackIndex == null) {
      const firstIdx = nextFromShuffle(null);
      loadTrack(firstIdx);
    }

    // IMPORTANT: dans le geste utilisateur, on force play() + on dé-mute
    bgm.muted = false;

    if (bgm.paused) {
      await tryPlayBgm({ mutedStart: false });
    } else {
      // si déjà en lecture muette, on dé-mute suffit souvent
      bgm.muted = false;
    }
  }

  // ===== GOOGLE TRANSLATE / FOCUS / VISIBILITY =====
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

  window.addEventListener("focus", () => {
    if (blurTimer) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }

    // si on revient (ex: translate nouvelle fenêtre fermée), on reprend si on jouait
    if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur) {
      claimLock();
      if (!lockIsMine()) return;
      if (bgm.paused) {
        try { bgm.play().catch(() => {}); } catch {}
      }
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseBgm();
  }, true);

  window.addEventListener("pagehide", pauseBgm, true);
  window.addEventListener("beforeunload", pauseBgm, true);

  // BFCache restore
  window.addEventListener("pageshow", () => {
    if (document.hidden) return;
    if (!isUnlocked()) return;

    claimLock();
    if (!lockIsMine()) return;

    try { if (bgm.paused) bgm.play().catch(() => {}); } catch {}
  }, true);

  // ===== ÉPÉE UNIQUEMENT SUR CLICK (et pas sur UI Translate) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;

    const t = e.target;
    if (t && t.closest) {
      if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame")) return;
    }
    playSword();
  }, true);

  // ===== FIRST GESTURE: unlock + force play =====
  const firstGesture = async (e) => {
    // si c’est un clic dans l’UI translate, on UNLOCK quand même (ça reste un geste)
    await unlockAndForcePlay();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };

  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  // ===== BOOT =====
  // Au chargement: on prépare (et éventuellement on démarre muet si possible),
  // mais on garantit le “vrai son” au 1er geste.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startBgmSoft, { once: true });
  } else {
    startBgmSoft();
  }

  window.__OSD_AUDIO_SINGLETON__ = { alive: true, id: instanceId };
})();
