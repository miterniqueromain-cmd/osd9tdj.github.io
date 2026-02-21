/* osd.js — OSD9TDJ — STABLE SIMPLE
   - 1 seul audio BGM + 1 son épée
   - Start au 1er geste utilisateur (mobile/PC)
   - Shuffle sans répétition (sessionStorage)
   - Enchaînement propre: ended => next
   - Erreur: error => next
   - Google Translate OK: blur/hidden pause, focus reprise si on jouait
*/

(() => {
  "use strict";

  // ===== SINGLETON =====
  if (window.__OSD_AUDIO__?.alive) return;

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

  const BLUR_PAUSE_DELAY_MS = 250;

  // session keys
  const K_UNLOCKED = "osd_audio_unlocked";
  const K_ORDER = "osd_playlist_order";
  const K_POS = "osd_playlist_pos";

  // ===== UTILS =====
  const log = (...a) => { try { /* console.log("[OSD]", ...a); */ } catch {} };

  function toAbs(url) {
    return new URL(String(url || ""), document.baseURI).href;
  }

  function isUnlocked() {
    try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; }
  }
  function markUnlocked() {
    try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {}
  }

  function ensureAudioEl(id) {
    // supprime doublons si jamais
    const all = document.querySelectorAll(`#${CSS.escape(id)}`);
    if (all.length > 1) {
      all.forEach((n, i) => {
        if (i === 0) return;
        try { n.pause(); } catch {}
        try { n.remove(); } catch {}
      });
    }

    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("audio");
      el.id = id;
      el.preload = "metadata"; // stable, pas agressif
      el.playsInline = true;
      el.style.display = "none";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  function fisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function getOrder() {
    try { return JSON.parse(sessionStorage.getItem(K_ORDER) || "[]"); } catch { return []; }
  }
  function setOrder(o) {
    try { sessionStorage.setItem(K_ORDER, JSON.stringify(o)); } catch {}
  }
  function getPos() {
    try { return parseInt(sessionStorage.getItem(K_POS) || "0", 10) || 0; } catch { return 0; }
  }
  function setPos(n) {
    try { sessionStorage.setItem(K_POS, String(n)); } catch {}
  }

  function ensureOrder() {
    const L = TRACKS.length;
    if (!L) return;

    let order = getOrder();
    let pos = getPos();

    const valid =
      Array.isArray(order) &&
      order.length === L &&
      order.every(n => Number.isInteger(n) && n >= 0 && n < L) &&
      Number.isInteger(pos) &&
      pos >= 0 && pos < L;

    if (!valid) {
      order = fisherYates([...Array(L)].map((_, i) => i));
      pos = 0;
      setOrder(order);
      setPos(pos);
    }
  }

  function nextIndex() {
    ensureOrder();
    const order = getOrder();
    let pos = getPos();

    const idx = order[pos];
    pos++;

    if (pos >= order.length) {
      // reshuffle, mais évite de recommencer par la dernière piste
      const last = order[order.length - 1];
      let newOrder = fisherYates([...Array(order.length)].map((_, i) => i));
      if (newOrder.length > 1 && newOrder[0] === last) {
        [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
      }
      setOrder(newOrder);
      pos = 0;
    }

    setPos(pos);
    return idx;
  }

  // ===== AUDIO STATE =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.loop = false;
  bgm.volume = BGM_VOLUME;

  const sword = ensureAudioEl("osd_sword");
  sword.src = toAbs(SWORD_SRC);
  sword.volume = SWORD_VOLUME;

  let started = false;
  let starting = false;
  let wasPlayingBeforeBlur = false;

  function loadTrackByIndex(i) {
    const src = TRACKS[i];
    bgm.src = toAbs(src);
    try { bgm.load(); } catch {}
  }

  async function playBgm() {
    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  async function startNow() {
    if (starting) return;
    starting = true;

    try {
      if (!TRACKS.length) return;

      // si pas de src encore, on charge une piste
      if (!bgm.src) {
        const i = nextIndex();
        loadTrackByIndex(i);
      }

      bgm.volume = BGM_VOLUME;
      bgm.muted = false;

      const ok = await playBgm();
      if (ok) {
        started = true;
        markUnlocked();
      }
    } finally {
      starting = false;
    }
  }

  async function nextTrack(reason) {
    if (!TRACKS.length) return;
    // stop propre
    try { bgm.pause(); } catch {}
    try { bgm.currentTime = 0; } catch {}

    const i = nextIndex();
    loadTrackByIndex(i);
    log("next", reason, i);

    // ne tente de rejouer que si l’audio est "unlocked"
    if (isUnlocked() && !document.hidden) {
      bgm.muted = false;
      await playBgm();
    }
  }

  // ===== EVENTS =====
  // Enchaînement normal
  bgm.addEventListener("ended", () => { nextTrack("ended"); });

  // Erreur vraie => piste suivante (sans “zapping” sur les events réseau)
  bgm.addEventListener("error", () => { nextTrack("error"); });

  // ===== GOOGLE TRANSLATE / FOCUS =====
  let blurTimer = null;

  function schedulePause() {
    wasPlayingBeforeBlur = !bgm.paused;

    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = null;
      const noFocus = (typeof document.hasFocus === "function") ? !document.hasFocus() : true;
      if (document.hidden || noFocus) {
        try { bgm.pause(); } catch {}
      }
    }, BLUR_PAUSE_DELAY_MS);
  }

  window.addEventListener("blur", schedulePause, true);

  window.addEventListener("focus", () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur) {
      // reprise douce
      try { bgm.play().catch(() => {}); } catch {}
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { bgm.pause(); } catch {}
    }
  }, true);

  window.addEventListener("pagehide", () => { try { bgm.pause(); } catch {} }, true);

  // ===== ÉPÉE (click only) =====
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
      // ignore UI Google Translate
      if (t.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame")) return;
    }
    playSword();
  }, true);

  // ===== 1ER GESTE UTILISATEUR = DÉMARRAGE GARANTI =====
  const onFirstGesture = async (e) => {
    // Toute interaction = musique
    await startNow();

    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
    document.removeEventListener("click", onFirstGesture, true);
  };

  document.addEventListener("pointerdown", onFirstGesture, true);
  document.addEventListener("keydown", onFirstGesture, true);
  document.addEventListener("click", onFirstGesture, true);

  // Si déjà unlocked dans cet onglet, on tente une reprise douce au chargement (sans forcer)
  const softBoot = () => {
    if (isUnlocked() && !document.hidden) {
      // charge une piste si pas déjà chargé
      if (!bgm.src) {
        const i = nextIndex();
        loadTrackByIndex(i);
      }
      bgm.muted = false;
      bgm.volume = BGM_VOLUME;
      bgm.play().catch(() => {});
    } else {
      // prépare une première piste (sans lecture)
      if (!bgm.src && TRACKS.length) {
        const i = nextIndex();
        loadTrackByIndex(i);
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", softBoot, { once: true });
  } else {
    softBoot();
  }

  window.__OSD_AUDIO__ = { alive: true };
})();
