(function(){
  "use strict";

  // Matricule => code personnel
  // Remplace les codes par les tiens
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

  function normalize(value){
    return String(value || "").trim().toLowerCase();
  }

  window.OSD_AUTH = {
    verify(member, code){
      if (!member || !code) return false;
      if (!USERS[member]) return false;
      return normalize(USERS[member]) === normalize(code);
    }
  };
})();
