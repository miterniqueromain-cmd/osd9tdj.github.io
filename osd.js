/* osd.js — OSD9TDJ — STABLE SIMPLE + FIX GOOGLE TRANSLATE
   - Musique démarre au 1er geste utilisateur
   - Playlist aléatoire sans répétition (sessionStorage)
   - Enchaînement: ended => next
   - Erreur vraie: error => next
   - Google Translate: si clic sur l'UI Translate => pause immédiate sur la page d'origine
     => évite "2 musiques à la fois" quand Translate ouvre une autre page
*/

(() => {
  "use strict";
     // Empêche toute musique si la page est dans un iframe (ex: bgFrame du menu)
  if (window.self !== window.top) return;

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

  const BLUR_PAUSE_DELAY_MS = 200;

  // session keys
  const K_UNLOCKED = "osd_audio_unlocked";
  const K_ORDER = "osd_playlist_order";
  const K_POS = "osd_playlist_pos";

  // ===== UTILS =====
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
      el.preload = "metadata";
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

  function getOrder() { try { return JSON.parse(sessionStorage.getItem(K_ORDER) || "[]"); } catch { return []; } }
  function setOrder(o) { try { sessionStorage.setItem(K_ORDER, JSON.stringify(o)); } catch {} }
  function getPos() { try { return parseInt(sessionStorage.getItem(K_POS) || "0", 10) || 0; } catch { return 0; } }
  function setPos(n) { try { sessionStorage.setItem(K_POS, String(n)); } catch {} }

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

  function isTranslateUI(target) {
    if (!target || !target.closest) return false;
    return !!target.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame");
  }

  // ===== AUDIO STATE =====
  const bgm = ensureAudioEl("osd_bgm");
  bgm.loop = false;
  bgm.volume = BGM_VOLUME;

  const sword = ensureAudioEl("osd_sword");
  sword.src = toAbs(SWORD_SRC);
  sword.volume = SWORD_VOLUME;

  let starting = false;
  let wasPlayingBeforeBlur = false;

  function loadTrackByIndex(i) {
    bgm.src = toAbs(TRACKS[i]);
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

      if (!bgm.src) {
        loadTrackByIndex(nextIndex());
      }

      bgm.volume = BGM_VOLUME;
      bgm.muted = false;

      const ok = await playBgm();
      if (ok) markUnlocked();
    } finally {
      starting = false;
    }
  }

  async function nextTrack(reason) {
    if (!TRACKS.length) return;

    try { bgm.pause(); } catch {}
    try { bgm.currentTime = 0; } catch {}

    loadTrackByIndex(nextIndex());

    if (isUnlocked() && !document.hidden) {
      bgm.muted = false;
      await playBgm();
    }
  }

  // ===== EVENTS =====
  bgm.addEventListener("ended", () => nextTrack("ended"));
  bgm.addEventListener("error", () => nextTrack("error"));

  // ===== GOOGLE TRANSLATE FIX : pause immédiate sur clic UI translate =====
  // IMPORTANT: c’est ça qui empêche les 2 musiques quand Translate ouvre une autre page.
  function pauseForTranslateUI() {
    wasPlayingBeforeBlur = false;
    try { bgm.pause(); } catch {}
  }

  document.addEventListener("pointerdown", (e) => {
    if (isTranslateUI(e.target)) pauseForTranslateUI();
  }, true);

  document.addEventListener("click", (e) => {
    if (isTranslateUI(e.target)) pauseForTranslateUI();
  }, true);

  // ===== FOCUS / VISIBILITY (Translate OK) =====
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
      try { bgm.play().catch(() => {}); } catch {}
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      try { bgm.pause(); } catch {}
    }
  }, true);

  window.addEventListener("pagehide", () => { try { bgm.pause(); } catch {} }, true);

  // ===== ÉPÉE (click only, ignore UI translate) =====
  function playSword() {
    try {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    if (isTranslateUI(e.target)) return; // ignore UI translate
    playSword();
  }, true);

  // ===== 1ER GESTE UTILISATEUR = DÉMARRAGE GARANTI =====
  const onFirstGesture = async (e) => {
    // Si l’utilisateur clique Translate, on ne démarre pas ici (on vient justement de pauser)
    if (isTranslateUI(e.target)) return;

    await startNow();

    document.removeEventListener("pointerdown", onFirstGesture, true);
    document.removeEventListener("keydown", onFirstGesture, true);
    document.removeEventListener("click", onFirstGesture, true);
  };

  document.addEventListener("pointerdown", onFirstGesture, true);
  document.addEventListener("keydown", onFirstGesture, true);
  document.addEventListener("click", onFirstGesture, true);

  // Boot doux: prépare une piste / reprend si déjà unlocked
  const softBoot = () => {
    if (!bgm.src && TRACKS.length) loadTrackByIndex(nextIndex());
    if (isUnlocked() && !document.hidden) {
      bgm.muted = false;
      bgm.volume = BGM_VOLUME;
      bgm.play().catch(() => {});
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", softBoot, { once: true });
  } else {
    softBoot();
  }

  window.__OSD_AUDIO__ = { alive: true };
})();
