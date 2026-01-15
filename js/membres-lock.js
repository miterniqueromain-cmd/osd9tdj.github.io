(function () {
  // ⏱️ durée de mémorisation
  const DUREE_VALIDITE_MS = 60 * 60 * 1000; // 1 heure

  // 🔑 Codes par “groupe”
  // - MEMBRES_DOCS : pour documents-internes.html (membres + externes + bureau)
  // - BUREAU_ADMIN : pour administration.html (bureau uniquement)
  const GROUPS = {
    MEMBRES_DOCS: [
      // Membres
      "Gm3105@",
      // Externes (à changer quand besoin)
      "externe2025@",
      // Bureau (si tu veux aussi que le bureau passe ici)
      "panpan2025@",
      "bambi2025@",
      "fbi2025@"
    ],

    BUREAU_ADMIN: [
      "Gm3105@",
      "panpan2025@",
      "bambi2025@"
    ]
  };

  // 🧾 Messages par page
  const MESSAGES = {
    MEMBRES_DOCS:
      "🔒 ACCÈS RÉSERVÉ (DOCUMENTS INTERNES) 🔒\n\n" +
      "Cette page est interne.\n" +
      "Toute diffusion ou accès non autorisé est interdit.",

    BUREAU_ADMIN:
      "⚠️ ACCÈS STRICTEMENT RÉSERVÉ AU BUREAU ⚠️\n\n" +
      "Toute tentative d’accès non autorisée,\n" +
      "intrusion ou utilisation frauduleuse\n" +
      "fera l’objet de poursuites judiciaires."
  };

  // ✅ Quel “groupe” doit être utilisé par la page ?
  const group = (window.ACCESS_GROUP || "").trim();

  // Sécurité : si pas de groupe défini, on refuse
  if (!group || !GROUPS[group]) {
    document.body.innerHTML = "";
    alert("Configuration d’accès manquante.");
    window.location.href = "index.html";
    return;
  }

  const now = Date.now();
  const storageKey = "access_" + group;
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");

  // Déjà validé (pendant 1h)
  if (saved && saved.expire > now) return;

  alert(MESSAGES[group] || "🔒 Accès réservé.");

  const saisie = prompt("Veuillez saisir le code d’accès :");
  const ok = saisie && GROUPS[group].includes(saisie.trim());

  if (!ok) {
    document.body.innerHTML = "";
    alert("⛔ Accès refusé.");
    window.location.href = "index.html";
    return;
  }

  // Mémorise 1 heure
  localStorage.setItem(storageKey, JSON.stringify({ expire: now + DUREE_VALIDITE_MS }));
})();
