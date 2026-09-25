'use strict';

(() => {
  const F = Foerderrechner;
  const $ = (id) => document.getElementById(id);
  const form = $('form');
  const reduziert = matchMedia('(prefers-reduced-motion: reduce)');

  const eurFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const zahlFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const eur = (x) => eurFmt.format(Math.round(x));
  const pct = (q) => `${pctFmt.format(q * 100)} %`;

  const LAENDER = [
    ['BW', 'Baden-Württemberg'], ['BY', 'Bayern'], ['BE', 'Berlin'], ['BB', 'Brandenburg'],
    ['HB', 'Bremen'], ['HH', 'Hamburg'], ['HE', 'Hessen'], ['MV', 'Mecklenburg-Vorpommern'],
    ['NI', 'Niedersachsen'], ['NW', 'Nordrhein-Westfalen'], ['RP', 'Rheinland-Pfalz'], ['SL', 'Saarland'],
    ['SN', 'Sachsen'], ['ST', 'Sachsen-Anhalt'], ['SH', 'Schleswig-Holstein'], ['TH', 'Thüringen'],
  ];
  $('land').innerHTML = LAENDER.map(([k, n]) => `<option value="${k}"${k === 'NW' ? ' selected' : ''}>${n}</option>`).join('');
  $('geburtsjahr').max = new Date().getFullYear() - 16;

  // ---------- Eingaben lesen und validieren ----------
  function zahl(id) {
    const el = $(id);
    const min = Number(el.min);
    const max = el.max === '' ? Infinity : Number(el.max);
    const roh = el.value.trim();
    const v = Number(roh.replace(',', '.'));
    const ok = roh !== '' && Number.isFinite(v) && v >= min && v <= max;
    el.setAttribute('aria-invalid', String(!ok));
    $(`${id}-fehler`).textContent = ok ? ''
      : max === Infinity ? `Bitte einen Wert ab ${zahlFmt.format(min)} eingeben.`
      : `Bitte einen Wert von ${zahlFmt.format(min)} bis ${zahlFmt.format(max)} eingeben.`;
    if (ok) return v;
    return Number.isFinite(v) && roh !== '' ? Math.min(max, Math.max(min, v)) : Number(el.defaultValue);
  }

  const radio = (name) => form.querySelector(`input[name="${name}"]:checked`).value;

  function lesen() {
    const kinder = Math.round(zahl('kinder'));
    $('kinderVor2008').max = kinder;
    const riester = $('riester').checked;
    return {
      riesterVergleich: riester,
      geburtsjahr: Math.round(zahl('geburtsjahr')),
      kinder,
      kinderVor2008: riester ? Math.round(zahl('kinderVor2008')) : 0,
      brutto: zahl('brutto') * 12,
      eigenbeitrag: zahl('beitrag') * 12,
      status: radio('status'),
      kirche: $('kirche').checked,
      land: $('land').value,
      kv: radio('kv'),
      kvSatz: zahl('kvSatz') / 100,
      pkvBeitrag: zahl('pkvBeitrag'),
    };
  }

  // ---------- Animierte Zahlen ----------
  function zaehlen(el, ziel, fmt) {
    const von = el._wert ?? ziel;
    el._wert = ziel;
    cancelAnimationFrame(el._raf);
    if (reduziert.matches || von === ziel) { el.textContent = fmt(ziel); return; }
    const t0 = performance.now();
    const schritt = (t) => {
      const p = Math.min(1, (t - t0) / 480);
      el.textContent = fmt(von + (ziel - von) * (1 - (1 - p) ** 3));
      if (p < 1) el._raf = requestAnimationFrame(schritt);
    };
    el._raf = requestAnimationFrame(schritt);
  }

  // ---------- Muenzen: 100 Stueck = 100 EUR im Vertrag ----------
  // Erst Eigenanteil vs. Staat nach gerundeter Quote, dann Staatsanteil per groesstem Rest aufteilen,
  // damit die Muenzen exakt zur Hero-Zahl passen.
  function muenzenVerteilen(r) {
    if (!r.gesamtbeitrag) return { eigen: 0, grund: 0, kind: 0, steuer: 0 };
    const staat = Math.round(r.quote * 100);
    const teile = { grund: r.grundzulage, kind: r.kinderzulage, steuer: r.steuervorteil };
    const roh = Object.entries(teile).map(([k, v]) => [k, r.foerderung ? (v / r.foerderung) * staat : 0]);
    const n = Object.fromEntries(roh.map(([k, v]) => [k, Math.floor(v)]));
    let rest = staat - n.grund - n.kind - n.steuer;
    roh.sort((a, b) => (b[1] % 1) - (a[1] % 1)).forEach(([k]) => { if (rest-- > 0) n[k]++; });
    return { eigen: 100 - staat, ...n };
  }

  function muenzen(el, r) {
    if (!el.children.length) {
      el.innerHTML = Array.from({ length: 100 }, (_, i) => `<i style="--i:${i}" data-seg="leer"></i>`).join('');
    }
    const n = muenzenVerteilen(r);
    const folge = ['eigen', 'grund', 'kind', 'steuer'].flatMap((k) => Array(n[k]).fill(k));
    [...el.children].forEach((c, i) => { c.dataset.seg = folge[i] || 'leer'; });
    el.setAttribute('aria-label', r.gesamtbeitrag
      ? `Von 100 € im Vertrag: ${n.eigen} € Eigenanteil, ${n.grund} € Grundzulage, ${n.kind} € Kinderzulage, ${n.steuer} € Steuervorteil`
      : 'Noch kein Beitrag');
  }

  // ---------- Kurve ----------
  const K = { l: 40, r: 344, o: 18, u: 170, luft: 40 };

  function kurve(i, a) {
    const monat = i.eigenbeitrag / 12;
    const bis = Math.max(150, Math.ceil(monat / 10) * 10);
    const punkte = F.kurve(i, bis);
    const qMax = Math.max(0.1, ...punkte.map((p) => p.quote));
    const yMax = Math.ceil(qMax * 10) / 10;
    const x = (m) => K.l + (m / bis) * (K.r - K.l);
    const y = (q) => K.u - (q / yMax) * (K.u - K.o - K.luft);

    // Treppe am Mindestbeitrag sauber zeichnen: senkrecht springen statt schraeg
    let d = '';
    punkte.forEach((p, idx) => {
      const prev = punkte[idx - 1];
      if (!prev) d += `M${x(p.monat).toFixed(1)},${y(p.quote).toFixed(1)}`;
      else {
        if (Math.abs(p.quote - prev.quote) > 0.05) d += `L${x(p.monat).toFixed(1)},${y(prev.quote).toFixed(1)}`;
        d += `L${x(p.monat).toFixed(1)},${y(p.quote).toFixed(1)}`;
      }
    });
    $('kurve-linie').setAttribute('d', d);
    $('kurve-flaeche').setAttribute('d', `${d}L${K.r},${K.u}L${K.l},${K.u}Z`);

    const yTicks = [0, yMax / 2, yMax];
    const xTicks = [0, 50, 100, 150, ...(bis > 150 ? [bis] : [])];
    $('kurve-achsen').innerHTML = [
      ...yTicks.map((q) => `<line class="kurve-achse" x1="${K.l}" x2="${K.r}" y1="${y(q)}" y2="${y(q)}"/>
        <text class="kurve-text" x="${K.l - 6}" y="${y(q) + 3.5}" text-anchor="end">${Math.round(q * 100)} %</text>`),
      ...xTicks.map((m) => `<text class="kurve-text" x="${x(m)}" y="${K.u + 16}" text-anchor="middle">${m} €</text>`),
      ...[30, 150].map((m) => `<line class="kurve-knick" x1="${x(m)}" x2="${x(m)}" y1="${K.o}" y2="${K.u}"/>
        <text class="kurve-text knick" x="${x(m) + (m === 30 ? 4 : -4)}" y="${K.o + 8}" text-anchor="${m === 30 ? 'start' : 'end'}">${m === 30 ? 'Knick' : 'Plateau'}</text>`),
    ].join('');

    const px = x(Math.min(monat, bis));
    const py = y(a.quote);
    const punkt = $('kurve-punkt');
    punkt.style.transform = `translate(${px}px, ${py}px)`;
    punkt.querySelector('line').setAttribute('y2', K.u - py);
    let label = punkt.querySelector('text');
    if (!label) {
      label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('y', -12);
      punkt.append(label);
    }
    label.setAttribute('text-anchor', px > K.r - 40 ? 'end' : px < K.l + 40 ? 'start' : 'middle');
    label.textContent = `Du: ${pct(a.quote)}`;
    $('kurve').setAttribute('aria-label', `Förderquote nach Monatsbeitrag von 0 bis ${bis} €. Dein Beitrag von ${zahlFmt.format(monat)} € ergibt ${pct(a.quote)}.`);
  }

  // ---------- Produktkarten (Vergleich) ----------
  function karteAufbauen(el, titel, unterzeile) {
    el.innerHTML = `
      <h3>${titel}</h3>
      <p class="unterzeile">${unterzeile}</p>
      <p class="p-quote"><span data-f="quote"></span><small>Förderquote</small></p>
      <div class="p-inhalt">
        <div class="muenzen" role="img"></div>
        <dl>
          <div><dt>Eigenbeitrag</dt><dd data-f="E"></dd></div>
          <div><dt>Zulagen</dt><dd data-f="zulagen"></dd></div>
          <div><dt>Zusätzl. Steuervorteil</dt><dd data-f="steuervorteil"></dd></div>
          <div><dt>Netto-Eigenanteil</dt><dd data-f="nettoEigenanteil"></dd></div>
          <div><dt>Landet im Vertrag</dt><dd data-f="gesamtbeitrag"></dd></div>
          <div class="summe"><dt>Förderung gesamt</dt><dd data-f="foerderung"></dd></div>
        </dl>
      </div>
      <p class="leer-text" hidden>Nicht förderberechtigt</p>`;
  }
  karteAufbauen($('p-avd'), 'Altersvorsorgedepot', 'neu ab 2027');
  karteAufbauen($('p-riester'), 'Riester', 'Bestandsvertrag, alte Regeln');

  function karte(el, r, gewinner) {
    el.classList.toggle('gewinner', gewinner);
    el.querySelector('.marke')?.remove();
    if (gewinner) el.insertAdjacentHTML('afterbegin', '<span class="marke">Mehr Förderung</span>');
    el.querySelector('.p-quote').hidden = !r.foerderberechtigt;
    el.querySelector('.p-inhalt').hidden = !r.foerderberechtigt;
    el.querySelector('.leer-text').hidden = r.foerderberechtigt;
    if (!r.foerderberechtigt) return;
    zaehlen(el.querySelector('[data-f="quote"]'), r.quote, pct);
    el.querySelectorAll('dd[data-f]').forEach((dd) => zaehlen(dd, r[dd.dataset.f], eur));
    muenzen(el.querySelector('.muenzen'), r);
  }

  // ---------- Hinweise ----------
  function hinweise(i, a, r) {
    const P = F.PARAMS;
    const liste = [];
    if (a.unterMindestbeitrag) liste.push(`Unter ${eur(P.avd.mindestbeitrag)} im Jahr (10 € im Monat) gibt es keine Zulagen.`);
    if (a.E > P.avd.stufe2) liste.push(`Gefördert werden nur die ersten ${eur(P.avd.stufe2)} im Jahr (150 € im Monat). Mehr darfst du einzahlen, es erhöht aber nicht die Förderung.`);
    if (a.bonus) liste.push(`Berufseinsteigerbonus: Du bist 2027 jünger als 25 und bekommst einmalig ${eur(a.bonus)} extra. Er ist nicht in der Quote enthalten.`);
    if (i.status === 'selbststaendig') liste.push('Als Selbstständige*r bekommst du die Förderung über deine Steuererklärung.');
    if (r && !r.foerderberechtigt) liste.push('Riester: Selbstständige sind nicht förderberechtigt.');
    if (r && r.gekuerzt) liste.push(`Riester: Dein Beitrag liegt unter dem Mindesteigenbeitrag von ${eur(r.mindesteigenbeitrag)} (4 % vom Vorjahresbrutto abzüglich Zulagen). Die Zulagen werden auf ${Math.round(r.faktor * 100)} % gekürzt.`);
    $('hinweis-liste').innerHTML = liste.map((t) => `<li>${t}</li>`).join('');
    $('hinweise').hidden = !liste.length;
  }

  // ---------- Rendern ----------
  const hero = $('quote');
  hero._wert = 0;
  let letzteQuote = null;
  let liveTimer;

  function render() {
    const i = lesen();
    const a = F.avd(i);
    const r = i.riesterVergleich ? F.riester(i) : null;

    // Sichtbarkeit abhaengiger Felder
    $('vor2008-feld').hidden = !i.riesterVergleich;
    $('kvSatz-feld').hidden = i.kv === 'privat';
    $('pkv-feld').hidden = i.kv !== 'privat';
    $('brutto-label').textContent = i.status === 'selbststaendig' ? 'Monatlicher Gewinn' : 'Monatliches Bruttogehalt';

    // Hero
    const quoteGanz = Math.round(a.quote * 100);
    zaehlen(hero, quoteGanz, (v) => zahlFmt.format(v));
    if (letzteQuote !== null && letzteQuote !== quoteGanz && !reduziert.matches) {
      $('hero').classList.remove('puls');
      void $('hero').offsetWidth;
      $('hero').classList.add('puls');
    }
    letzteQuote = quoteGanz;
    $('satz').innerHTML = a.E === 0
      ? 'Stell einen Beitrag ein, um deine Förderung zu sehen.'
      : `Von 100 € in deinem Depot zahlt der Staat <b>${quoteGanz} €</b>.`;

    // Muenzen + Legende
    muenzen($('muenzen'), a);
    const legende = { eigen: Math.max(0, a.nettoEigenanteil), grund: a.grundzulage, kind: a.kinderzulage, steuer: a.steuervorteil };
    for (const [k, v] of Object.entries(legende)) {
      zaehlen($(`l-${k}`), v, eur);
      $(`l-${k}`).parentElement.classList.toggle('null', v < 0.5);
    }

    // Kennzahlen
    zaehlen($('k-foerderung'), a.foerderung, eur);
    zaehlen($('k-netto'), a.nettoEigenanteil, eur);
    zaehlen($('k-gesamt'), a.gesamtbeitrag, eur);
    zaehlen($('k-zve'), a.zve, eur);
    zaehlen($('k-grenz'), a.grenzsteuersatz, pct);

    kurve(i, a);

    // Riester-Vergleich
    $('vergleich').hidden = !r;
    $('vergleich-kurz').hidden = !r;
    if (r) {
      const diff = r.foerderberechtigt ? a.foerderung - r.foerderung : a.foerderung;
      const avdVorn = diff >= 0.5;
      const riesterVorn = diff <= -0.5;
      karte($('p-avd'), a, avdVorn);
      karte($('p-riester'), r, riesterVorn);
      $('urteil').innerHTML = !r.foerderberechtigt
        ? 'Selbstständige können nicht riestern. Für dich bleibt das <b>Altersvorsorgedepot</b>.'
        : avdVorn ? `Das <b>Altersvorsorgedepot</b> bringt dir <b>${eur(diff)}</b> mehr Förderung pro Jahr.`
        : riesterVorn ? `<b>Riester</b> bringt dir <b>${eur(-diff)}</b> mehr Förderung pro Jahr.`
        : 'Beide Produkte bringen dir gleich viel Förderung.';
      $('vergleich-kurz').textContent = !r.foerderberechtigt ? 'Riester: nicht förderberechtigt'
        : avdVorn ? `Depot schlägt Riester um ${eur(diff)}/Jahr`
        : riesterVorn ? `Riester schlägt Depot um ${eur(-diff)}/Jahr`
        : 'Depot und Riester gleichauf';
    }

    hinweise(i, a, r);

    // Mobile Leiste
    $('leiste-quote').textContent = `${quoteGanz} %`;
    $('leiste-betrag').textContent = eur(a.foerderung);

    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      $('live').textContent = `Förderquote ${quoteGanz} Prozent, Förderung ${eur(a.foerderung)} pro Jahr.`;
    }, 900);
  }

  // ---------- Ereignisse ----------
  const slider = $('beitragSlider');
  const beitrag = $('beitrag');
  const sliderFuellen = () => slider.style.setProperty('--fuell', `${(slider.value / slider.max) * 100}%`);

  slider.addEventListener('input', () => { beitrag.value = slider.value; sliderFuellen(); });
  beitrag.addEventListener('input', () => { slider.value = beitrag.value || 0; sliderFuellen(); });

  form.addEventListener('change', (e) => {
    // Beamte sind fast immer privat versichert (Beihilfe)
    if (e.target.name === 'status' && e.target.value === 'verbeamtet') {
      form.querySelector('input[name="kv"][value="privat"]').checked = true;
    }
    render();
  });
  form.addEventListener('input', render);
  form.addEventListener('submit', (e) => e.preventDefault());

  // Kurzfassung unten nur, wenn die Ergebniskarte nicht im Bild ist
  new IntersectionObserver(([e]) => $('leiste').classList.toggle('sichtbar', !e.isIntersecting))
    .observe(document.querySelector('.ergebnis-karte'));

  sliderFuellen();
  render();
})();
