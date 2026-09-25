'use strict';
const assert = require('node:assert/strict');
const F = require('./calc.js');

const basis = {
  geburtsjahr: 1990, kinder: 0, kinderVor2008: 0, brutto: 48000, eigenbeitrag: 1800,
  status: 'angestellt', kirche: false, land: 'NW', kv: 'gesetzlich', kvSatz: 0.175, pkvBeitrag: 500,
};
const mit = (o) => ({ ...basis, ...o });
const nah = (a, b) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);

// 1. E = 360, K = 0 -> Grundzulage 180
nah(F.avd(mit({ eigenbeitrag: 360 })).grundzulage, 180);

// 2. E = 1.800, K = 2 -> Grundzulage 540, Kinderzulage 600
const r2 = F.avd(mit({ eigenbeitrag: 1800, kinder: 2 }));
nah(r2.grundzulage, 540);
nah(r2.kinderzulage, 600);

// 3. E = 100 -> keine Zulagen
const r3 = F.avd(mit({ eigenbeitrag: 100, kinder: 1 }));
nah(r3.zulagen, 0);
assert.ok(r3.unterMindestbeitrag);

// 4. Riester: B = 30.000, K = 0, E = 1.025 -> M = 1.025, volle Zulage 175
const r4 = F.riester(mit({ brutto: 30000, eigenbeitrag: 1025 }));
nah(r4.mindesteigenbeitrag, 1025);
nah(r4.zulagen, 175);
// halber Beitrag -> halbe Zulage
nah(F.riester(mit({ brutto: 30000, eigenbeitrag: 512.5 })).zulagen, 87.5);

// 5. Riester, Selbststaendige -> nicht foerderberechtigt
assert.equal(F.riester(mit({ status: 'selbststaendig' })).foerderberechtigt, false);

// 6. Guenstigerpruefung: B = 90.000 -> Steuervorteil > 0
const r6 = F.avd(mit({ brutto: 90000 }));
assert.ok(r6.steuervorteil > 0, `Steuervorteil ${r6.steuervorteil}`);
nah(r6.foerderung, r6.zulagen + r6.steuervorteil);
nah(r6.quote, r6.foerderung / (r6.E + r6.zulagen));

// 7. ESt-Tarif 2026, Stuetzstellen (Grundtarif)
assert.equal(F.einkommensteuer(12348), 0);
assert.equal(F.einkommensteuer(20000), 1570);
assert.equal(F.einkommensteuer(50000), 10548);
assert.equal(F.einkommensteuer(80000), 22464);
// Tarif stetig an den Zonengrenzen
for (const g of [17799, 69878, 277825]) {
  assert.ok(Math.abs(F.einkommensteuer(g + 1) - F.einkommensteuer(g)) <= 1, `Sprung bei ${g}`);
}

// Soli: Freigrenze und Milderungszone
assert.equal(F.solidaritaetszuschlag(20350), 0);
nah(F.solidaritaetszuschlag(21000), 650 * 0.119);

// Berufseinsteigerbonus: 2027 - 2003 = 24 < 25
assert.equal(F.avd(mit({ geburtsjahr: 2003 })).bonus, 200);
assert.equal(F.avd(mit({ geburtsjahr: 2002 })).bonus, 0);

// Kurve: Knick bei 30 EUR/Monat
const k = F.kurve(mit({ brutto: 0 }), 150);
nah(k[30].quote, 1 / 3);
assert.ok(k[150].quote < k[30].quote);

console.log('alle Tests ok');
