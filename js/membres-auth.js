(function () {
  "use strict";

  const USERS = {
    "OSD9TDJ-HT-0001": "alpha59",
    "OSD9TDJ-HT-0002": "delta59",
    "OSD9TDJ-HT-0003": "kappa88",
    "OSD9TDJ-HT-0004": "sigma44",
    "OSD9TDJ-HT-0005": "omega77",
    "OSD9TDJ-HT-0006": "gamma19",
    "OSD9TDJ-HT-0007": "beta52",
    "OSD9TDJ-HT-0008": "theta91",
    "OSD9TDJ-HT-0009": "zeta33",
    "OSD9TDJ-HT-0010": "delta02",
    "OSD9TDJ-HT-0011": "phi88",
    "OSD9TDJ-HT-0012": "kappa21"
  };

  const STORAGE_KEY = "osd_auth_attempts_v1";
  const MAX_ATTEMPTS = 5;
  const LOCK_DURATION_MS = 15 * 60 * 1000;

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeMember(member) {
    return String(member || "").trim().toUpperCase();
  }

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { failures: 0, lockedUntil: 0 };
      const parsed = JSON.parse(raw);
      return {
        failures: Number(parsed.failures || 0),
        lockedUntil: Number(parsed.lockedUntil || 0)
      };
    } catch (e) {
      return { failures: 0, lockedUntil: 0 };
    }
  }

  function writeState(state) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function resetFailures() {
    writeState({ failures: 0, lockedUntil: 0 });
  }

  function isLocked() {
    const state = readState();
    return Date.now() < state.lockedUntil;
  }

  function getRemainingLockMs() {
    const state = readState();
    return Math.max(0, state.lockedUntil - Date.now());
  }

  function registerFailure() {
    const state = readState();
    const failures = state.failures + 1;

    if (failures >= MAX_ATTEMPTS) {
      writeState({
        failures: 0,
        lockedUntil: Date.now() + LOCK_DURATION_MS
      });
      return {
        locked: true,
        remainingMs: LOCK_DURATION_MS
      };
    }

    writeState({
      failures,
      lockedUntil: 0
    });

    return {
      locked: false,
      failuresRemaining: MAX_ATTEMPTS - failures
    };
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) return `${seconds}s`;
    return `${minutes} min ${seconds}s`;
  }

  function verify(member, code) {
    const cleanMember = normalizeMember(member);
    const cleanCode = normalizeText(code);

    if (isLocked()) {
      return {
        ok: false,
        code: "locked",
        message: "⛔ Trop de tentatives. Réessaie dans " + formatRemaining(getRemainingLockMs()) + "."
      };
    }

    if (!cleanMember) {
      return {
        ok: false,
        code: "missing_member",
        message: "⚠️ Merci de sélectionner votre matricule."
      };
    }

    if (!cleanCode) {
      return {
        ok: false,
        code: "missing_code",
        message: "⚠️ Merci de saisir votre code personnel."
      };
    }

    if (!Object.prototype.hasOwnProperty.call(USERS, cleanMember)) {
      const result = registerFailure();
      if (result.locked) {
        return {
          ok: false,
          code: "locked",
          message: "⛔ Trop de tentatives. Réessaie dans " + formatRemaining(result.remainingMs) + "."
        };
      }

      return {
        ok: false,
        code: "unknown_member",
        message: "⛔ Matricule inconnu."
      };
    }

    const expectedCode = normalizeText(USERS[cleanMember]);

    if (cleanCode !== expectedCode) {
      const result = registerFailure();

      if (result.locked) {
        return {
          ok: false,
          code: "locked",
          message: "⛔ Trop de tentatives. Réessaie dans " + formatRemaining(result.remainingMs) + "."
        };
      }

      return {
        ok: false,
        code: "bad_code",
        message: "⛔ Code personnel incorrect pour ce matricule. Les majuscules et minuscules sont ignorées."
      };
    }

    resetFailures();

    return {
      ok: true,
      code: "success",
      message: "Code vérifié."
    };
  }

  window.OSD_AUTH = {
    verify,
    isLocked,
    getRemainingLockMs,
    formatRemaining
  };
})();
