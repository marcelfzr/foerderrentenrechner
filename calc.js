'use strict';

// Alle Werte Stand 2026. Bei Veroeffentlichung der Werte fuer 2027 hier aktualisieren.
const PARAMS = {
  jahr: 2026,
  avdStartjahr: 2027, // Altersvorsorgereformgesetz, BGBl. 29.05.2026, gilt ab 01.01.2027

  // § 32a EStG 2026 (Steuerfortentwicklungsgesetz, BGBl. 2024 I Nr. 449)
  est: {
    grundfreibetrag: 12348,
    zone2Ende: 17799,
    zone3Ende: 69878,
    zone4Ende: 277825,
    zone2: [914.51, 1400],
    zone3: [173.1, 2397, 1034.87],
    zone4Abzug: 11135.63,
    zone5Abzug: 19470.38,
  },

  // § 3, § 4 SolZG 1995, Freigrenze 2026 (Einzelveranlagung)
  soli: { satz: 0.055, freigrenze: 20350, milderung: 0.119 },

  // Kirchensteuergesetze der Laender: 8 % in BY und BW, sonst 9 %
  kist: { laender8: ['BY', 'BW'], satz8: 0.08, satz9: 0.09 },

  // Sozialversicherungsrechengroessenverordnung 2026 (bundeseinheitlich)
  bbgRv: 101400,
  bbgKv: 69750,

  // § 158 SGB VI
  rvSatz: 0.186,

  // § 243 SGB V: ermaessigter Satz 14,0 statt 14,6 % (ohne Krankengeld)
  kvErmaessigtAbschlag: 0.006,
  // § 10 Abs. 1 Nr. 3 Buchst. a EStG: 4 % Kuerzung wegen Krankengeldanspruch
  kvKrankengeldAbschlag: 0.04,

  // § 55 SGB XI (Stand 2025/2026)
  pv: {
    satz: 0.036,
    anteilAn: 0.018,
    anteilAnSachsen: 0.023, // Sachsen: Buss- und Bettag nicht abgeschafft, AN traegt 0,5 %-Punkte mehr
    kinderlosZuschlag: 0.006,
    kinderlosAbAlter: 23,
    abschlagJeKind: 0.0025, // ab dem 2. bis zum 5. Kind (Kinder unter 25)
    abschlagMaxKinder: 5,
  },

  // § 257 SGB V, § 61 SGB XI: AG-Hoechstzuschuss PKV 2026 je Monat
  // KV: (14,6 % + 2,9 %) / 2 x 5.812,50 = 508,59 EUR; PV: 1,8 % x 5.812,50 = 104,63 EUR
  pkvAgHoechstzuschuss: (508.59 + 104.63) * 12,

  // § 9a Nr. 1a EStG, § 10c EStG
  werbungskostenpauschale: 1230,
  sonderausgabenpauschale: 36,

  // Altersvorsorgedepot, §§ 84, 85 EStG n.F.
  avd: {
    mindestbeitrag: 120,
    stufe1: 360, // 50 % Zulage bis hier
    satz1: 0.5,
    stufe2: 1800, // 25 % Zulage bis hier, gleichzeitig Grenze fuer den Sonderausgabenabzug
    satz2: 0.25,
    kinderzulageMax: 300, // 100 % der Beitraege, hoechstens 300 EUR je Kind
    einzahlungsgrenze: 6840,
    einsteigerbonus: 200,
    einsteigerbonusBisAlter: 25,
  },

  // Riester alt, §§ 84, 85, 86, 10a EStG a.F.
  riester: {
    grundzulage: 175,
    kindVor2008: 185,
    kindAb2008: 300,
    mindestQuote: 0.04,
    hoechstbetrag: 2100,
    sockelbetrag: 60,
  },
};

function einkommensteuer(zve) {
  const p = PARAMS.est;
  const x = Math.floor(Math.max(0, zve));
  let t;
  if (x <= p.grundfreibetrag) t = 0;
  else if (x <= p.zone2Ende) {
    const y = (x - p.grundfreibetrag) / 1e4;
    t = (p.zone2[0] * y + p.zone2[1]) * y;
  } else if (x <= p.zone3Ende) {
    const z = (x - p.zone2Ende) / 1e4;
    t = (p.zone3[0] * z + p.zone3[1]) * z + p.zone3[2];
  } else if (x <= p.zone4Ende) t = 0.42 * x - p.zone4Abzug;
  else t = 0.45 * x - p.zone5Abzug;
  return Math.floor(t);
}

function solidaritaetszuschlag(est) {
  const s = PARAMS.soli;
  if (est <= s.freigrenze) return 0;
  return Math.min(est * s.satz, (est - s.freigrenze) * s.milderung);
}

// ponytail: Kinderfreibetrag bei Soli/KiSt ignoriert, Eltern bekommen leicht ueberhoehte Werte.
function steuer(zve, i) {
  const est = einkommensteuer(zve);
  const k = PARAMS.kist;
  const kist = i.kirche ? est * (k.laender8.includes(i.land) ? k.satz8 : k.satz9) : 0;
  return est + solidaritaetszuschlag(est) + kist;
}

function vorsorgeaufwendungen(i) {
  const P = PARAMS;
  const B = i.brutto;
  const kvBasis = Math.min(B, P.bbgKv);
  const alter = P.jahr - i.geburtsjahr;
  const pvZuschlag = i.kinder === 0 && alter >= P.pv.kinderlosAbAlter ? P.pv.kinderlosZuschlag : 0;
  // ponytail: alle Kinder gelten als unter 25, sonst Alter je Kind abfragen
  const pvAbschlag = Math.max(0, Math.min(i.kinder, P.pv.abschlagMaxKinder) - 1) * P.pv.abschlagJeKind;

  if (i.status === 'angestellt') {
    const rv = (Math.min(B, P.bbgRv) * P.rvSatz) / 2;
    if (i.kv === 'privat') {
      // ponytail: gesamter PKV-Beitrag gilt als Basisabsicherung inkl. PV
      const beitrag = i.pkvBeitrag * 12;
      return rv + beitrag - Math.min(beitrag / 2, P.pkvAgHoechstzuschuss);
    }
    const kv = ((kvBasis * i.kvSatz) / 2) * (1 - P.kvKrankengeldAbschlag);
    const pvAn = i.land === 'SN' ? P.pv.anteilAnSachsen : P.pv.anteilAn;
    const pv = kvBasis * (pvAn + pvZuschlag - pvAbschlag);
    return rv + kv + pv;
  }

  // selbststaendig und verbeamtet: keine RV, Beitraege voll selbst getragen
  if (i.kv === 'privat') return i.pkvBeitrag * 12;
  return kvBasis * (i.kvSatz - P.kvErmaessigtAbschlag + P.pv.satz + pvZuschlag - pvAbschlag);
}

function zuVersteuerndesEinkommen(i) {
  const wk = i.status === 'selbststaendig' ? 0 : PARAMS.werbungskostenpauschale;
  return Math.max(0, i.brutto - wk - PARAMS.sonderausgabenpauschale - vorsorgeaufwendungen(i));
}

function ergebnis(i, E, zulagen, sa) {
  const zve = zuVersteuerndesEinkommen(i);
  const steuerersparnis = steuer(zve, i) - steuer(Math.max(0, zve - sa), i);
  const steuervorteil = Math.max(0, steuerersparnis - zulagen);
  const foerderung = zulagen + steuervorteil;
  const gesamtbeitrag = E + zulagen;
  return {
    zve,
    grenzsteuersatz: (steuer(zve + 50, i) - steuer(Math.max(0, zve - 50), i)) / 100,
    steuerersparnis,
    steuervorteil,
    foerderung,
    nettoEigenanteil: E - steuervorteil,
    gesamtbeitrag,
    quote: gesamtbeitrag > 0 ? foerderung / gesamtbeitrag : 0,
  };
}

function avd(i) {
  const A = PARAMS.avd;
  const E = i.eigenbeitrag;
  const mitZulage = E >= A.mindestbeitrag;
  const grundzulage = mitZulage
    ? A.satz1 * Math.min(E, A.stufe1) + A.satz2 * Math.max(0, Math.min(E, A.stufe2) - A.stufe1)
    : 0;
  // § 85 EStG n.F.: je Kind 100 % der Beitraege bis 1.800 EUR, hoechstens 300 EUR
  const kinderzulage = mitZulage ? i.kinder * Math.min(E, A.kinderzulageMax) : 0;
  const zulagen = grundzulage + kinderzulage;
  const sa = Math.min(E, A.stufe2) + zulagen;
  return {
    produkt: 'avd',
    foerderberechtigt: true,
    E,
    grundzulage,
    kinderzulage,
    zulagen,
    sa,
    unterMindestbeitrag: E > 0 && !mitZulage,
    bonus: PARAMS.avdStartjahr - i.geburtsjahr < A.einsteigerbonusBisAlter ? A.einsteigerbonus : 0,
    ...ergebnis(i, E, zulagen, sa),
  };
}

function riester(i) {
  if (i.status === 'selbststaendig') return { produkt: 'riester', foerderberechtigt: false };
  const R = PARAMS.riester;
  const E = i.eigenbeitrag;
  const kinderAb2008 = Math.max(0, i.kinder - i.kinderVor2008);
  const kindVoll = R.kindVor2008 * i.kinderVor2008 + R.kindAb2008 * kinderAb2008;
  const Z = R.grundzulage + kindVoll;
  // ponytail: Vorjahresbrutto = aktuelles Brutto
  const M = Math.max(R.sockelbetrag, Math.min(R.hoechstbetrag, R.mindestQuote * i.brutto) - Z);
  const faktor = Math.min(1, E / M);
  const grundzulage = R.grundzulage * faktor;
  const kinderzulage = kindVoll * faktor;
  const zulagen = grundzulage + kinderzulage;
  const sa = Math.min(E + zulagen, R.hoechstbetrag);
  return {
    produkt: 'riester',
    foerderberechtigt: true,
    E,
    grundzulage,
    kinderzulage,
    zulagen,
    sa,
    mindesteigenbeitrag: M,
    faktor,
    gekuerzt: E > 0 && faktor < 1,
    ...ergebnis(i, E, zulagen, sa),
  };
}

// Foerderquote AVD je vollem Euro Monatsbeitrag von 0 bis bisMonat
function kurve(i, bisMonat) {
  const punkte = [];
  for (let m = 0; m <= bisMonat; m++) {
    punkte.push({ monat: m, quote: avd({ ...i, eigenbeitrag: m * 12 }).quote });
  }
  return punkte;
}

const Foerderrechner = { PARAMS, einkommensteuer, solidaritaetszuschlag, steuer, vorsorgeaufwendungen, zuVersteuerndesEinkommen, avd, riester, kurve };
if (typeof module !== 'undefined') module.exports = Foerderrechner;
