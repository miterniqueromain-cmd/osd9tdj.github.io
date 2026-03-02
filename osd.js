/* osd.js — SAFE MODE (anti-crash) — OSD9TDJ
   - Audio stable + playlist session
   - Google Translate persistance googtrans + auto-apply
   - Anti-bannière Google Translate (CSS + cleanup + observer)
*/

(() => {
  "use strict";

  // ===== SUPER GARDE-FOUS : si quoi que ce soit échoue, on ne casse pas le site
  const SAFE = (fn) => { try { fn(); } catch (e) { /* silence */ } };

  // Si iframe (ex: bgFrame menu), pas de musique (comme chez toi)
  if (window.self !== window.top) return;

  // Singleton
  if (window.__OSD_AUDIO__?.alive) return;

  // =========================
  // Google Translate helpers
  // =========================
  function injectGTStylesOnce() {
    SAFE(() => {
      if (document.getElementById("osd-gt-css")) return;
      const css = `
        iframe.goog-te-banner-frame,
        .goog-te-banner-frame,
        .goog-te-banner-frame.skiptranslate,
        .goog-te-banner{ display:none !important; visibility:hidden !important; }
        #goog-gt-tt, .goog-te-balloon-frame{ display:none !important; }
        html, body{ top:0 !important; position:static !important; }
        .goog-te-gadget{ display:none !important; }
      `;
      const st = document.createElement("style");
      st.id = "osd-gt-css";
      st.textContent = css;
      document.head.appendChild(st);
    });
  }

  function killGTBanner() {
    SAFE(() => {
      document.querySelectorAll("iframe.goog-te-banner-frame").forEach(el => el.remove());
      document.querySelectorAll(".goog-te-banner-frame").forEach(el => el.remove());
      const tt = document.getElementById("goog-gt-tt");
      if (tt) tt.remove();
      document.querySelectorAll(".goog-te-balloon-frame").forEach(el => el.remove());
      document.documentElement.style.top = "0px";
      document.body.style.top = "0px";
      document.body.style.position = "static";
    });
  }

  function observeGTBanner() {
    SAFE(() => {
      if (window.__OSD_GT_OBS__) return;
      const obs = new MutationObserver(() => killGTBanner());
      obs.observe(document.documentElement, { childList: true, subtree: true });
      window.__OSD_GT_OBS__ = obs;
    });
  }

  function setCookie(name, value, days) {
    SAFE(() => {
      const d = new Date();
      d.setTime(d.getTime() + (days * 24 * 60 * 60 * 1000));
      document.cookie = name + "=" + encodeURIComponent(value) +
        ";expires=" + d.toUTCString() + ";path=/;SameSite=Lax";
    });
  }
  function getCookie(name) {
    return SAFE(() => {
      const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
      return m ? decodeURIComponent(m[2]) : "";
    }) || "";
  }

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
        if (combo.value !== lang) {
          combo.value = lang;
          combo.dispatchEvent(new Event("change", { bubbles: true }));
        }
        clearInterval(timer);
        killGTBanner();
        setTimeout(killGTBanner, 300);
        setTimeout(killGTBanner, 1200);
      } else if (Date.now() - start > 12000) {
        clearInterval(timer);
      }
    }, 200);
  }

  function applyRememberedLanguage() {
    const gt = getCookie("googtrans");
    const parts = (gt || "").split("/");
    const lang = (parts.length >= 3) ? (parts[2] || "") : "";
    if (lang && lang !== "fr") applyLanguageToCombo(lang);
  }

  // Callback global Google Translate
  window.googleTranslateElementInit = function () {
    injectGTStylesOnce();
    killGTBanner();
    observeGTBanner();

    SAFE(() => {
      if (window.google?.translate?.TranslateElement) {
        new window.google.translate.TranslateElement(
          { pageLanguage: "fr", autoDisplay: false },
          "google_translate_element"
        );
      }
    });

    applyRememberedLanguage();
    killGTBanner();
    setTimeout(killGTBanner, 300);
    setTimeout(killGTBanner, 1200);
  };

  // API globale
  window.OSD_setLanguage = function (lang) {
    rememberLanguage(lang);
    applyLanguageToCombo(lang);
  };

  // =========================
  // AUDIO (ton système)
  // =========================
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

  const K_UNLOCKED = "osd_audio_unlocked";
  const K_ORDER = "osd_playlist_order";
  const K_POS = "osd_playlist_pos";

  function toAbs(url) { return new URL(String(url || ""), document.baseURI).href; }

  function isUnlocked() { try { return sessionStorage.getItem(K_UNLOCKED) === "1"; } catch { return false; } }
  function markUnlocked() { try { sessionStorage.setItem(K_UNLOCKED, "1"); } catch {} }

  function ensureAudioEl(id) {
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
    return !!target.closest("#google_translate_element, .goog-te-gadget, .skiptranslate, .goog-te-menu-frame, .goog-te-combo, iframe.goog-te-menu-frame");
  }

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
    SAFE(() => bgm.load());
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
      if (!bgm.src) loadTrackByIndex(nextIndex());
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
    SAFE(() => bgm.pause());
    SAFE(() => { bgm.currentTime = 0; });
    loadTrackByIndex(nextIndex());
    if (isUnlocked() && !document.hidden) {
      bgm.muted = false;
      await playBgm();
    }
  }

  bgm.addEventListener("ended", () => nextTrack());
  bgm.addEventListener("error", () => nextTrack());

  // Optionnel : pause sur UI translate (garde UX propre)
  function pauseForTranslateUI() {
    wasPlayingBeforeBlur = false;
    SAFE(() => bgm.pause());
  }

  document.addEventListener("pointerdown", (e) => {
    if (isTranslateUI(e.target)) pauseForTranslateUI();
  }, true);
  document.addEventListener("click", (e) => {
    if (isTranslateUI(e.target)) pauseForTranslateUI();
  }, true);

  // Focus/blur
  let blurTimer = null;
  function schedulePause() {
    wasPlayingBeforeBlur = !bgm.paused;
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => {
      blurTimer = null;
      const noFocus = (typeof document.hasFocus === "function") ? !document.hasFocus() : true;
      if (document.hidden || noFocus) SAFE(() => bgm.pause());
    }, BLUR_PAUSE_DELAY_MS);
  }

  window.addEventListener("blur", schedulePause, true);
  window.addEventListener("focus", () => {
    if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    if (!document.hidden && isUnlocked() && wasPlayingBeforeBlur) SAFE(() => bgm.play().catch(() => {}));
  }, true);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) SAFE(() => bgm.pause());
  }, true);

  window.addEventListener("pagehide", () => SAFE(() => bgm.pause()), true);

  // Épée click
  function playSword() {
    SAFE(() => {
      sword.currentTime = 0;
      const p = sword.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.isTrusted) return;
    if (isTranslateUI(e.target)) return;
    playSword();
  }, true);

  // 1er geste
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

  // Boot doux
  const softBoot = () => {
    if (!bgm.src && TRACKS.length) loadTrackByIndex(nextIndex());
    if (isUnlocked() && !document.hidden) {
      bgm.muted = false;
      bgm.volume = BGM_VOLUME;
      SAFE(() => bgm.play().catch(() => {}));
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", softBoot, { once: true });
  } else {
    softBoot();
  }

  // DOM ready (translate + anti-bar + branch UI)
  document.addEventListener("DOMContentLoaded", () => {
    injectGTStylesOnce();
    killGTBanner();
    observeGTBanner();

    applyRememberedLanguage();

    // Branche ton UI custom si présente
    const btn = document.getElementById("translateBtn");
    const langSelect = document.getElementById("langSelect");
    if (btn && langSelect) btn.addEventListener("click", () => window.OSD_setLanguage(langSelect.value));

    document.querySelectorAll(".quickLang").forEach(b => {
      b.addEventListener("click", function () {
        window.OSD_setLanguage(this.getAttribute("data-lang"));
      });
    });

    setTimeout(killGTBanner, 600);
    setTimeout(killGTBanner, 1800);
  });

  window.__OSD_AUDIO__ = { alive: true };
})();
