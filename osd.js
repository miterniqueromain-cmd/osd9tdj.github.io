/* osd.js — OSD9TDJ — STABLE SIMPLE + FIX GOOGLE TRANSLATE
   - Musique démarre au 1er geste utilisateur
   - Playlist aléatoire sans répétition (sessionStorage)
   - Enchaînement: ended => next
   - Erreur vraie: error => next
   - Google Translate:
       * Fix audio: si clic UI Translate => pause immédiate
       * Mode "TOP": persistance langue via cookie googtrans
       * Ré-application automatique sur chaque page
       * Anti-bannière: CSS + DOM cleanup + MutationObserver + reset offsets
       * API globale: window.OSD_setLanguage(lang)
*/

(() => {
  "use strict";

  // Empêche toute musique si la page est dans un iframe (ex: bgFrame du menu)
  if (window.self !== window.top) return;

  // ===== SINGLETON =====
  if (window.__OSD_AUDIO__?.alive) return;

  // =====================================================================
  // ✅ GOOGLE TRANSLATE — HIDE TOP BANNER (CSS injecté)
  // =====================================================================
  function injectGTStylesOnce() {
    if (document.getElementById("osd-gt-css")) return;
    const css = `
      iframe.goog-te-banner-frame,
      .goog-te-banner-frame,
      .goog-te-banner-frame.skiptranslate,
      .goog-te-banner{
        display:none !important;
        visibility:hidden !important;
      }
      #goog-gt-tt, .goog-te-balloon-frame{
        display:none !important;
      }
      html, body{
        top:0 !important;
        position:static !important;
      }
      /* On garde ton UI à toi, on cache le gadget standard */
      .goog-te-gadget{ display:none !important; }
    `;
    const style = document.createElement("style");
    style.id = "osd-gt-css";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function killGTBanner() {
    try {
      document.querySelectorAll("iframe.goog-te-banner-frame").forEach(el => el.remove());
      document.querySelectorAll(".goog-te-banner-frame").forEach(el => el.remove());

      const tt = document.getElementById("goog-gt-tt");
      if (tt) tt.remove();
      document.querySelectorAll(".goog-te-balloon-frame").forEach(el => el.remove());

      document.documentElement.style.top = "0px";
      document.body.style.top = "0px";
      document.body.style.position = "static";
    } catch {}
  }

  function observeGTBanner() {
    if (window.__OSD_GT_OBS__) return;
    try {
      const obs = new MutationObserver(() => killGTBanner());
      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.__OSD_GT_OBS__ = obs;
    } catch {}
  }

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
    return !!target.closest(
      "#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame, .goog-te-combo, iframe.goog-te-menu-frame"
    );
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

  async function nextTrack() {
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
  bgm.addEventListener("ended", () => nextTrack());
  bgm.addEventListener("error", () => nextTrack());

  // ===== GOOGLE TRANSLATE FIX : pause immédiate sur clic UI translate =====
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

  // ===== FOCUS / VISIBILITY =====
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
    if (isTranslateUI(e.target)) return;
    playSword();
  }, true);

  // ===== 1ER GESTE UTILISATEUR = DÉMARRAGE =====
  const onFirstGesture = async (e) => {
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

  // =====================================================================
  // ✅ GOOGLE TRANSLATE — MODE "TOP" (PERSISTANCE + AUTO-APPLY + ANTI-BAR)
  // =====================================================================

  function setCookie(name, value, days) {
    const d = new Date();
    d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = name + "=" + encodeURIComponent(value) +
      ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
  }

  function getCookie(name) {
    const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  // Google persiste la langue via cookie "googtrans" : "/fr/de"
  function rememberLanguage(lang) {
    if (!lang || lang === "fr") {
      setCookie("googtrans", "/fr/fr", 365);
      return;
    }
    setCookie("googtrans", "/fr/" + lang, 365);
  }

  function applyLanguageToCombo(lang) {
    const start = Date.now();
    const timer = setInterval(() => {
      const combo = document.querySelector(".goog-te-combo");
      if (combo) {
        // évite re-trigger inutile
        if (combo.value !== lang) {
          combo.value = lang;
          combo.dispatchEvent(new Event("change", { bubbles: true }));
        }
        clearInterval(timer);

        // Google réinjecte parfois -> re-clean
        killGTBanner();
        setTimeout(killGTBanner, 300);
        setTimeout(killGTBanner, 1200);
      } else if (Date.now() - start > 10000) {
        clearInterval(timer);
      }
    }, 200);
  }

  function setLanguage(lang) {
    if (!lang) return;

    rememberLanguage(lang);
    pauseForTranslateUI(); // propre

    applyLanguageToCombo(lang);
  }

  function applyRememberedLanguage() {
    const gt = getCookie("googtrans") || "";
    const parts = gt.split("/");
    const lang = (parts.length >= 3) ? (parts[2] || "") : "";

    if (lang && lang !== "fr") {
      const combo = document.querySelector(".goog-te-combo");
      if (combo && combo.value === lang) return;
      applyLanguageToCombo(lang);
    }
  }

  // Callback attendu par element.js?cb=googleTranslateElementInit
  window.googleTranslateElementInit = function () {
    injectGTStylesOnce();
    killGTBanner();

    try {
      if (window.google && window.google.translate && window.google.translate.TranslateElement) {
        new window.google.translate.TranslateElement(
          { pageLanguage: "fr", autoDisplay: false },
          "google_translate_element"
        );
      }
    } catch {}

    applyRememberedLanguage();

    killGTBanner();
    setTimeout(killGTBanner, 300);
    setTimeout(killGTBanner, 1200);

    observeGTBanner();
  };

  // API globale
  window.OSD_setLanguage = setLanguage;

  // Init DOM
  document.addEventListener("DOMContentLoaded", () => {
    injectGTStylesOnce();
    killGTBanner();
    observeGTBanner();

    applyRememberedLanguage();

    // Si page avec UI custom (index)
    const btn = document.getElementById("translateBtn");
    const langSelect = document.getElementById("langSelect");
    if (btn && langSelect) {
      btn.addEventListener("click", () => setLanguage(langSelect.value));
    }
    document.querySelectorAll(".quickLang").forEach(b => {
      b.addEventListener("click", function () {
        setLanguage(this.getAttribute("data-lang"));
      });
    });

    setTimeout(killGTBanner, 600);
    setTimeout(killGTBanner, 1800);
  });

  // ===== FIN =====
  window.__OSD_AUDIO__ = { alive: true };
})();
