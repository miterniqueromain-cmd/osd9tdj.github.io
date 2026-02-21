/* osd.js — OSD9TDJ (playlist + épée) — STABLE FIX
   Fix principal: NE PLUS skipper sur events "stalled/suspend/emptied" (trop fréquents).
   -> On skip uniquement sur: ended + error
   -> Et on garde un watchdog qui skip seulement si vraiment bloqué > 10s

   + Unlock mobile robuste (play dans le geste)
   + Google Translate OK (pause blur/hidden)
   + Lock global si storage dispo, sinon fallback (ne bloque jamais l’audio)
*/

(() => {
  "use strict";

  // ===== SINGLETON =====
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

  const K_UNLOCKED = "osd_audio_unlocked";
  const K_ORDER = "osd_playlist_order";
  const K_POS   = "osd_playlist_pos";

  const LOCK_KEY = "osd_audio_lock";
  const CHANNEL_NAME = "osd_audio_channel";
  const instanceId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const STALE_LOCK_MS = 15_000;

  const BLUR_PAUSE_DELAY_MS = 300;

  // watchdog (bloqué si currentTime n'avance pas)
  const WATCHDOG_TICK_MS = 2000;
  const WATCHDOG_STUCK_MS = 10_000;

  // ===== UTILS =====
  const log  = (...a) => { try { console.log("[OSD]", ...a); } catch {} };
  const warn = (...a) => { try { console.warn("[OSD]", ...a); } catch {} };

  function toAbs(url) {
    return new URL(String(url || ""), document.baseURI).href;
  }
  function playlistLen() { return Array.isArray(TRACKS) ? TRACKS.length : 0; }

  function markUnlocked(){ try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {} }
  function isUnlocked(){ try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; } }

  function safePause(a){ try { a.pause(); } catch {} }
  function safeStop(a){ try { a.pause(); } catch {} try { a.currentTime = 0; } catch {} }

  function storageOK() {
    try {
      const k = "__osd_test__";
      localStorage.setItem(k, "1");
      localStorage.removeItem(k);
      return true;
    } catch { return false; }
  }
  const LOCK_ENABLED = storageOK();
  if (!LOCK_ENABLED) warn("localStorage indisponible -> lock global OFF (audio OK).");

  // ===== AUDIO ELEMENTS =====
  function ensureAudioEl(id) {
    // supprime doublons (sécurité)
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
      el.preload = "metadata";     // ✅ important: évite réseau agressif au boot
      el.playsInline = true;
      el.style.display = "none";
      (document.body || document.documentElement).appendChild(el);
    }
    return el;
  }

  const bgm = ensureAudioEl("osd_bgm");
  bgm.loop = false;
  bgm.volume = BGM_VOLUME;

  const sword = ensureAudioEl("osd_sword");
  sword.src = toAbs(SWORD_SRC);
  sword.volume = SWORD_VOLUME;

  // ===== SHUFFLE =====
  function getOrder(){ try { return JSON.parse(sessionStorage.getItem(K_ORDER) || "[]"); } catch { return []; } }
  function setOrder(arr){ try { sessionStorage.setItem(K_ORDER, JSON.stringify(arr)); } catch {} }
  function getPos(){ try { return parseInt(sessionStorage.getItem(K_POS) || "0", 10) || 0; } catch { return 0; } }
  function setPos(n){ try { sessionStorage.setItem(K_POS, String(n)); } catch {} }

  function fisherYates(arr){
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function ensureShuffleOrder(){
    const L = playlistLen();
    if (!L) return;
    let order = getOrder();
    let pos = getPos();

    const valid =
      Array.isArray(order) &&
      order.length === L &&
      order.every(n => Number.isInteger(n) && n >= 0 && n < L) &&
      Number.isInteger(pos) && pos >= 0 && pos < L;

    if (!valid){
      order = fisherYates([...Array(L)].map((_, i) => i));
      pos = 0;
      setOrder(order);
      setPos(pos);
    }
  }

  function nextFromShuffle(lastIndexOrNull){
    ensureShuffleOrder();
    const order = getOrder();
    let pos = getPos();

    let idx = order[pos];
    pos++;

    if (pos >= order.length) {
      const last = order[order.length - 1];
      let newOrder = fisherYates([...Array(order.length)].map((_, i) => i));
      if (newOrder.length > 1 && newOrder[0] === last) [newOrder[0], newOrder[1]] = [newOrder[1], newOrder[0]];
      setOrder(newOrder);
      pos = 0;
    }

    if (Number.isInteger(lastIndexOrNull) && order.length > 1 && idx === lastIndexOrNull) {
      ensureShuffleOrder();
      const o2 = getOrder();
      let p2 = getPos();
      idx = o2[p2];
      p2++;
      if (p2 >= o2.length) p2 = 0;
      setPos(p2);
      return idx;
    }

    setPos(pos);
    return idx;
  }

  // ===== LOCK GLOBAL =====
  let bc = null;
  try { bc = ("BroadcastChannel" in window) ? new BroadcastChannel(CHANNEL_NAME) : null; } catch { bc = null; }

  function writeLock(owner){
    if (!LOCK_ENABLED) return;
    try { localStorage.setItem(LOCK_KEY, JSON.stringify({ owner, t: Date.now() })); } catch {}
  }

  function readLock(){
    if (!LOCK_ENABLED) return { owner: instanceId, t: Date.now() };
    try {
      const raw = localStorage.getItem(LOCK_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      if (!obj.owner || typeof obj.owner !== "string") return null;
      if (!obj.t || typeof obj.t !== "number") return null;
      if (Date.now() - obj.t > STALE_LOCK_MS) return null;
      return obj;
    } catch { return null; }
  }

  function lockIsMine(){
    if (!LOCK_ENABLED) return true;
    const lock = readLock();
    return lock && lock.owner === instanceId;
  }

  function claimLock(){
    writeLock(instanceId);
    if (bc) {
      try { bc.postMessage({ type: "CLAIM", owner: instanceId }); } catch {}
    }
  }

  if (bc) {
    bc.onmessage = (ev) => {
      const msg = ev && ev.data;
      if (msg && msg.type === "CLAIM") {
        if (!LOCK_ENABLED) return;
        if (msg.owner && msg.owner !== instanceId) safePause(bgm);
      }
    };
  }

  window.addEventListener("storage", (e) => {
    if (!LOCK_ENABLED) return;
    if (e.key !== LOCK_KEY) return;
    const lock = readLock();
    if (lock && lock.owner && lock.owner !== instanceId) safePause(bgm);
  });

  // ===== PLAY CORE =====
  let currentTrackIndex = null;
  let skipping = false;

  function loadTrack(i){
    if (!playlistLen()) return;
    currentTrackIndex = i;
    safeStop(bgm);
    bgm.src = toAbs(TRACKS[currentTrackIndex]);
    try { bgm.load(); } catch {}
  }

  async function playBgm({ mutedStart }){
    if (!playlistLen()) return false;
    bgm.volume = BGM_VOLUME;
    bgm.muted = !!mutedStart;

    try {
      const p = bgm.play();
      if (p && typeof p.then === "function") await p;
      return true;
    } catch {
      return false;
    }
  }

  async function skipToNext(reason){
    if (skipping) return;
    skipping = true;
    try {
      if (!playlistLen()) return;

      claimLock();
      if (!lockIsMine()) return;
      if (document.hidden) return;

      const nextIdx = nextFromShuffle(currentTrackIndex);
      loadTrack(nextIdx);

      const unlocked = isUnlocked();
      const ok = await playBgm({ mutedStart: !unlocked });
      if (ok && unlocked) bgm.muted = false;

      log("skipToNext", reason, "=>", nextIdx);
    } finally {
      skipping = false;
    }
  }

  // ✅ IMPORTANT: on skip UNIQUEMENT sur ended + error (le reste est géré par watchdog)
  bgm.addEventListener("ended", () => skipToNext("ended"));
  bgm.addEventListener("error", () => skipToNext("error"));

  // watchdog anti-stall (skip seulement si vrai blocage long)
  let lastT = 0;
  let stuckMs = 0;

  setInterval(() => {
    if (!bgm || !bgm.src) { lastT = 0; stuckMs = 0; return; }
    if (bgm.paused) { lastT = bgm.currentTime || 0; stuckMs = 0; return; }
    if (document.hidden) { stuckMs = 0; return; }

    const t = bgm.currentTime || 0;
    if (t <= lastT + 0.01) stuckMs += WATCHDOG_TICK_MS;
    else stuckMs = 0;

    lastT = t;

    if (stuckMs >= WATCHDOG_STUCK_MS) {
      stuckMs = 0;
      skipToNext("watchdog_stuck");
    }
  }, WATCHDOG_TICK_MS);

  // ===== START / UNLOCK =====
  async function startSoft(){
    if (!playlistLen()) return;

    claimLock();
    if (!lockIsMine()) return;
    if (document.hidden) return;

    if (currentTrackIndex == null) {
      const firstIdx = nextFromShuffle(null);
      loadTrack(firstIdx);
    }

    // si déjà unlocked: play normal
    if (isUnlocked()) {
      const ok = await playBgm({ mutedStart: false });
      if (ok) return;
    }

    // sinon: tentative muette (souvent autorisée)
    await playBgm({ mutedStart: true });
  }

  async function unlockHard(){
    markUnlocked();

    claimLock();
    if (!lockIsMine()) return;
    if (document.hidden) return;

    if (currentTrackIndex == null) {
      const firstIdx = nextFromShuffle(null);
      loadTrack(firstIdx);
    }

    // Dans le geste utilisateur => play non-muet garanti
    bgm.muted = false;
    if (bgm.paused) await playBgm({ mutedStart: false });
    else bgm.muted = false;
  }

  // ===== FOCUS / VISIBILITY (Translate OK) =====
  let blurTimer = null;
  let wasPlayingBeforeBlur = false;

  function schedulePauseOnBlur(){
    wasPlayingBeforeBlur = !bgm.paused;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = null;
      const noFocus = (typeof document.hasFocus === "function") ? !document.hasFocus() : true;
      if (document.hidden || noFocus) safePause(bgm);
    }, BLUR_PAUSE_DELAY_MS);
  }

  window.addEventListener("blur", schedulePauseOnBlur, true);

  window.addEventListener("focus", () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }

    if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur) {
      claimLock();
      if (!lockIsMine()) return;
      try { if (bgm.paused) bgm.play().catch(() => {}); } catch {}
    }
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) safePause(bgm);
  }, true);

  window.addEventListener("pagehide", () => safePause(bgm), true);
  window.addEventListener("beforeunload", () => safePause(bgm), true);

  window.addEventListener("pageshow", () => {
    if (document.hidden) return;
    if (!isUnlocked()) return;
    claimLock();
    if (!lockIsMine()) return;
    try { if (bgm.paused) bgm.play().catch(() => {}); } catch {}
  }, true);

  // ===== ÉPÉE (click only, ignore UI translate) =====
  function playSword(){
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

  // 1er geste = unlock HARD
  const firstGesture = async () => {
    await unlockHard();
    document.removeEventListener("click", firstGesture, true);
    document.removeEventListener("keydown", firstGesture, true);
  };
  document.addEventListener("click", firstGesture, true);
  document.addEventListener("keydown", firstGesture, true);

  // boot
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startSoft, { once: true });
  } else {
    startSoft();
  }

  window.__OSD_AUDIO_SINGLETON__ = { alive: true, id: instanceId };
})();
