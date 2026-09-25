# Förderrenten-Rechner – Spec

Stand: 2026-09-25. Rechtsgrundlage: Altersvorsorgereformgesetz (Bundestag 27.03.2026, Bundesrat 05/2026), gilt ab 01.01.2027.

## Ziel

Statische Webseite, die zeigt, ob sich das geförderte Altersvorsorgedepot (AVD) lohnt: Förderquote, Zulagen, Steuervorteil, Eigenanteil. Optional Vergleich mit Riester (alte Regeln, Bestandsvertrag).

Nicht-Ziele: Kapitalprojektion/Rendite, Zusammenveranlagung, Anlageberatung, Backend, Tracking.

## Tech

- Vanilla HTML/CSS/JS, kein Build, keine Abhängigkeiten. Dateien: `index.html`, `style.css`, `app.js`, `calc.js`.
- `calc.js`: reine Funktionen, ohne DOM. Alle Parameter (Tarif, BBG, Sätze) in einem `PARAMS`-Objekt oben in der Datei, damit man sie pro Jahr einfach aktualisieren kann.
- `calc.test.js`: Asserts für Referenzfälle, laufen mit `node calc.test.js`.
- Neuberechnung live bei jeder Eingabe, kein Submit-Button.
- Responsiv (ab 360 px), Dark Mode über `prefers-color-scheme`, Barrierefreiheit: Labels, Tastaturbedienung, Kontrast AA.
- Sprache: Deutsch. Zahlen mit `Intl.NumberFormat('de-DE')`.

## Eingaben

### Basis (immer sichtbar)
| Feld | Typ | Default | Validierung |
|---|---|---|---|
| Geburtsjahr | Zahl | 1990 | 1940 bis aktuelles Jahr − 16 |
| Kindergeldberechtigte Kinder | Zahl | 0 | 0–10 |
| Monatliches Bruttogehalt | € | 4.000 | ≥ 0 |
| Monatlicher Eigenbeitrag | € (Slider + Feld) | 150 | 0–570 (6.840 €/Jahr Einzahlungsgrenze) |
| Vergleich mit Riester | Toggle | aus | – |
| Davon Kinder vor 2008 geboren | Zahl | 0 | nur bei aktivem Riester-Vergleich, ≤ Kinderzahl |

### Details (einklappbar)
| Feld | Typ | Default |
|---|---|---|
| Berufsstatus | angestellt / selbstständig-freiberuflich / verbeamtet | angestellt |
| Kirchensteuerpflichtig | ja/nein | nein |
| Bundesland | 16er-Auswahl | NW |
| Krankenversicherung | gesetzlich / privat | gesetzlich (verbeamtet: privat) |
| KV-Beitragssatz inkl. Zusatzbeitrag | % | 14,6 + 2,9 = 17,5 |
| PKV-Monatsbeitrag (nur bei privat) | € | 500 |

Bei privater KV passt ein Prozentsatz nicht, deshalb erscheint dann das Feld für den Monatsbeitrag in €.

Bei Selbstständigen gilt „Bruttogehalt“ als monatlicher Gewinn; das Label ändert sich entsprechend.

## Rechenlogik (jährlich)

Bezeichnungen: `E` = Eigenbeitrag/Jahr (Monatsbeitrag × 12), `K` = Anzahl Kinder, `B` = Brutto/Jahr (Monatsbrutto × 12).

### AVD
- Förderberechtigt: alle drei Status. Selbstständige sind neu dabei (§ 15/§ 18 EStG, Steuererklärung nötig).
- Liegt `E` unter 120 €, gibt es keine Zulagen. Hinweis anzeigen.
- Grundzulage = 0,5 × min(E, 360) + 0,25 × max(0, min(E, 1.800) − 360). Maximum 540 €.
- Kinderzulage = K × min(E, 300).
  *Annahme:* Dieselben Euros lösen Grund- und Kinderzulage aus, und der Nutzer erhält die Kinderzulage. **Vor der Umsetzung gegen den Gesetzestext (§ 85 EStG n.F.) prüfen.**
- Berufseinsteigerbonus: einmalig 200 €, wenn 2027 − Geburtsjahr < 25. Wird separat angezeigt und fließt nicht in die Jahresquote ein.
- Sonderausgaben SA = min(E, 1.800) + Zulagen.

### Riester (alte Regeln, Bestandsvertrag)
- Förderberechtigt: angestellt, verbeamtet. Selbstständige nicht; dann zeigt die Riester-Spalte „nicht förderberechtigt“.
- Volle Zulage Z = 175 + 185 × K_vor2008 + 300 × (K − K_vor2008).
- Mindesteigenbeitrag M = max(60, min(2.100, 0,04 × B) − Z). Näherung: Das Vorjahresbrutto entspricht dem aktuellen.
- Zulage = Z × min(1, E / M). Die Zulage wird anteilig gekürzt, wenn E < M.
- SA = min(E + Zulage, 2.100).

### Steuer / Günstigerprüfung (beide Produkte)
1. zvE ohne Vorsorge-SA = B − Werbungskostenpauschale (nur bei Angestellten/Beamten) − Sonderausgabenpauschale − Vorsorgeaufwendungen.
2. Vorsorgeaufwendungen nach Status:
   - angestellt: RV-AN-Anteil (9,3 % bis BBG RV). GKV: AN-Anteil (Beitragssatz/2, abzüglich 4 % wegen Krankengeld) bis BBG KV. PV: AN-Anteil, Sachsen mit Sonderanteil, Kinderlosenzuschlag bei K = 0, Abschlag ab dem 2. Kind. PKV: Monatsbeitrag × 12 − AG-Zuschuss (Näherung: min(50 %, AG-Höchstzuschuss)).
   - selbstständig: keine RV. GKV: voller Satz (ermäßigt, ohne Krankengeld) bis BBG. PKV: voller Beitrag.
   - verbeamtet: keine RV. PKV voll (Beihilfe-Tarif = Eingabe).
3. ESt nach § 32a (Grundtarif), dazu Soli (Freigrenze + Milderungszone) und KiSt (8 % BY/BW, sonst 9 %).
   Ponytail: Kinderfreibetrag bei Soli/KiSt wird ignoriert. Grenze: leicht überhöhte Werte bei Eltern. Nachrüsten, falls Abweichungen stören.
4. Steuerersparnis S = Steuer(zvE) − Steuer(zvE − SA), wobei Steuer = ESt + Soli + KiSt.
5. Zusätzlicher Steuervorteil = max(0, S − Zulagen).

### Ausgabe je Produkt
- Förderung gesamt F = Zulagen + zusätzlicher Steuervorteil.
- Netto-Eigenanteil = E − zusätzlicher Steuervorteil.
- Gesamtbeitrag = E + Zulagen (das landet tatsächlich im Vertrag).
- **Förderquote = F / (E + Zulagen)**.
- Zusätzlich: Grenzsteuersatz, zvE.

### Parameter (in `PARAMS`, Werte 2026, bei Veröffentlichung 2027 aktualisieren)
ESt-Tarif § 32a, Soli-Freigrenze, BBG KV/RV, RV-Satz 18,6 %, PV-Satz inkl. Sachsen-Sonderregel, Kinderlosenzuschlag, Kinderabschläge, Werbungskostenpauschale 1.230 €, Sonderausgabenpauschale 36 €, Förderwerte AVD und Riester wie oben. Beim Implementieren jeden Wert mit Quelle kommentieren.

## Darstellung

**UI-Design hat hohe Priorität.** Die Seite soll hochwertig, eigenständig und modern wirken, nicht wie ein generisches Formular oder ein Standard-Template. Dazu gehören eine klare visuelle Hierarchie, durchdachte Typografie, eine konsistente Farbpalette mit Design-Tokens und flüssige Micro-Animationen bei Wertänderungen. Jede Ansicht (Desktop, Mobil, Dark Mode) wird vor dem Abschluss visuell geprüft. Bei der Umsetzung kommt der `frontend`-Skill zum Einsatz.

- Layout: Eingaben links, Ergebnis rechts (sticky). Mobil untereinander, Ergebnis-Kurzfassung als Sticky-Bar unten.
- Hero-Zahl: Förderquote AVD, groß und animiert. Daneben ein Satz wie „Von 100 € in deinem Depot zahlt der Staat 31 €“.
- Visual „Wer zahlt deinen Euro“: gestapelter Balken bzw. Münzstapel mit den Segmenten Eigenanteil, Grundzulage, Kinderzulage, Steuervorteil. Animiert bei Änderungen.
- Zulagen-Kurve: kleiner Chart mit Förderquote über dem Monatsbeitrag (0–150 €), eigener Punkt markiert. Zeigt den Knick bei 30 €/Monat (360 €/Jahr) und das Plateau ab 150 €/Monat. Hilft, den „optimalen“ Beitrag zu finden.
- Riester-Vergleich: zwei Spalten nebeneinander mit denselben Visuals. Gewinner hervorheben und Differenz in €/Jahr nennen.
- Hinweise-Box: Mindestbeitrag, Berufseinsteigerbonus, Riester nicht förderberechtigt, Riester-Kürzung wegen Unterschreiten von 4 %.
- Disclaimer: keine Steuer- oder Anlageberatung, Näherungsrechnung, Stand der Parameter.
- Charts als eigenes SVG, keine Chart-Library.

## Tests (calc.test.js)
Referenzfälle mit Handrechnung:
1. E = 360, K = 0 → Grundzulage 180.
2. E = 1.800, K = 2 → Grundzulage 540, Kinderzulage 600.
3. E = 100 → keine Zulagen.
4. Riester: B = 30.000, K = 0, E = 1.025 → M = 1.025, volle Zulage 175.
5. Riester, Selbstständige → nicht förderberechtigt.
6. Günstigerprüfung: hohes Einkommen (B = 90.000) ergibt Steuervorteil > 0.
7. ESt-Tarif: 2–3 Stützstellen gegen den BMF-Rechner prüfen.

## Offene Punkte
- Kinderzulage-Mechanik gegen den finalen Gesetzestext prüfen.
- Werte für 2027 (Tarif, BBG, Zusatzbeitrag) bei Veröffentlichung eintragen.
- Mittelbar Förderberechtigte (Ehepartner) und Frühstart-Rente sind bewusst nicht enthalten.
