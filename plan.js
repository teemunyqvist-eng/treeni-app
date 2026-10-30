/**
 * Treenisuunnitelman generointi – maraton + voima
 * Paavo Nurmi Marathon 2027 (Turku) oletuskohde.
 */
(function (global) {
  'use strict';

  const PHASES = {
    base: { id: 'base', name: 'Peruskunto', color: '#4a90c8' },
    build: { id: 'build', name: 'Rakennus', color: '#1a7f5a' },
    peak: { id: 'peak', name: 'Huippu', color: '#d4a017' },
    taper: { id: 'taper', name: 'Taper', color: '#9b7ed9' }
  };

  const DOW_FI = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
  const DOW_FULL = ['Sunnuntai', 'Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai', 'Lauantai'];

  function pad(n) { return String(n).padStart(2, '0'); }

  function toISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseISO(s) {
    const [y, m, day] = s.split('-').map(Number);
    return new Date(y, m - 1, day);
  }

  function addDays(d, n) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }

  function daysBetween(a, b) {
    const ms = parseISO(toISO(b)) - parseISO(toISO(a));
    return Math.round(ms / 86400000);
  }

  function startOfWeek(d) {
    // Maanantai alku
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay(); // 0=su
    const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff);
    return x;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function round1(n) { return Math.round(n * 10) / 10; }

  /** Fitness-tason perusviikkokm ja pitkä lenkki */
  function fitnessBaseline(level, garmin) {
    let weekly = 20;
    let longest = 12;
    if (garmin && garmin.avgWeeklyKm) {
      weekly = garmin.avgWeeklyKm;
      longest = garmin.longestRunKm || weekly * 0.35;
    } else if (level === 'aloittelija') {
      weekly = 18; longest = 10;
    } else if (level === 'aloittelija-keskitaso') {
      // Aloittelija–keskitaso (≈18–20 km/vk)
      weekly = 19; longest = 14;
    } else if (level === 'keskitaso') {
      weekly = 28; longest = 16;
    } else if (level === 'kokenut') {
      weekly = 45; longest = 22;
    }
    if (garmin && garmin.manualWeeklyKm) weekly = garmin.manualWeeklyKm;
    if (garmin && garmin.manualLongestKm) longest = garmin.manualLongestKm;
    // Lähtövolyymi lähellä nykyistä (~20–25), ei hyppyä 35 km:iin
    return { weekly: clamp(weekly, 15, 80), longest: clamp(longest, 8, 35) };
  }

  /**
   * Vaihe: taper 2 vk, peak 3 vk, build 6 vk, loput base.
   * Jos kilpailuun > 20 vk, näytetään base-progressio.
   */
  function getPhase(weeksToRace) {
    if (weeksToRace <= 0) return PHASES.taper;
    if (weeksToRace <= 2) return PHASES.taper;
    if (weeksToRace <= 5) return PHASES.peak;
    if (weeksToRace <= 11) return PHASES.build;
    return PHASES.base;
  }

  function isDeloadWeek(weekIndex) {
    // Deload joka 4. viikko (0-indexed: 3, 7, 11...)
    return weekIndex > 0 && (weekIndex + 1) % 4 === 0;
  }

  /**
   * Kevennysviikot kiinnitetty kalenteriin (ei liu'u sen mukaan, milloin suunnitelma generoitiin):
   * 3 kuormitusviikkoa + 1 kevennys, ankkuri ma 9.11.2026 → 7.12., 4.1., 1.2. ...
   */
  const DELOAD_ANCHOR = '2026-11-09';
  const DELOAD_LABEL = 'Kevennysviikko';
  const DELOAD_NOTES = {
    '2026-11-09': 'Kevennysviikko: paljon aamuvuoroja ja yövuorojen jälkeistä väsymystä, iltaisin lapset kotona. ' +
      'Lyhyet 20–40 min treenit – siirrä vapaasti viikon sisällä. Pidempi lenkki iltavuoro- tai ensimmäiselle yövuoropäivälle.'
  };
  const DELOAD_DEFAULT_NOTE = 'Kevennysviikko: ~30 % vähemmän, ei kovaa laatua. Keho vahvistuu levossa – 3 kuormaviikkoa + 1 kevennys.';

  function isDeloadWeekDate(weekStart) {
    const ws = typeof weekStart === 'string' ? parseISO(weekStart) : startOfWeek(weekStart);
    const diff = Math.round(daysBetween(parseISO(DELOAD_ANCHOR), ws) / 7);
    return ((diff % 4) + 4) % 4 === 0;
  }

  function deloadNote(weekStartISO) {
    return DELOAD_NOTES[weekStartISO] || DELOAD_DEFAULT_NOTE;
  }

  /** Progressiivinen pitkä lenkki ~10 % sääntö nykyisestä pisimmästä + deload */
  function longRunKm(baseLongest, weekIndex, weeksToRace, deload) {
    // Aloita hieman alle nykyisen pisimmän (varovainen volyyminosto), kasva ≤10 %/vk
    let startLong = round1(clamp(baseLongest * 0.85, 10, baseLongest));
    let target = startLong;
    const growthWeeks = Math.min(weekIndex, 16);
    for (let i = 0; i < growthWeeks; i++) {
      target = round1(target * 1.08); // ~8 %/vk ≈ alle 10 % säännön
      // älä ylitä nykyistä pisintä + 10 % liian aikaisin
      const softCap = baseLongest * (1 + 0.1 * Math.min(i + 1, 4));
      if (i < 4) target = Math.min(target, softCap);
    }
    // Peak: pidä / hieman nosta
    if (weeksToRace <= 5 && weeksToRace > 2) {
      target = Math.max(target, baseLongest * 1.35);
      target = Math.min(target, 32);
    }
    // Taper
    if (weeksToRace <= 2) {
      target = weeksToRace <= 1 ? Math.min(12, baseLongest * 0.5) : Math.min(18, baseLongest * 0.7);
    }
    if (deload) target *= 0.7;
    return round1(clamp(target, 6, 35));
  }

  /**
   * Pitkän lenkin katto kuukausitavoitteiden mukaan (marras 11–13 km, joulu 13–15 km).
   * Viikkokohtainen tasainen nousu; kevennysviikolla ~9 km. Avain = viikon maanantai.
   */
  const LONG_RUN_CAPS = {
    '2026-11-16': 12, '2026-11-23': 12.5, '2026-11-30': 13,
    '2026-12-07': 9, '2026-12-14': 13.5, '2026-12-21': 14, '2026-12-28': 15
  };
  const LONG_RUN_MONTH_CAPS = { '2026-10': 12, '2026-11': 13, '2026-12': 15 };
  /**
   * Kuukausitavoitteet (pidä synkassa progress.js KM_TARGETS): viikkokm-yläraja + pitkän yläraja.
   * Automaattinen suunnitelma ei ylitä näitä (kevennysviikolla ×0,7).
   */
  const MONTH_KM_CAPS = {
    '2026-11': { week: 28, long: 13 }, '2026-12': { week: 30, long: 15 },
    '2027-01': { week: 32, long: 16 }, '2027-02': { week: 35, long: 18 }, '2027-03': { week: 38, long: 20 },
    '2027-04': { week: 40, long: 22 }, '2027-05': { week: 45, long: 25 }, '2027-06': { week: 50, long: 28 },
    '2027-07': { week: 52, long: 32 }, '2027-09': { week: 30, long: null }, '2027-10': { week: 30, long: null }
  };

  function weeklyKmCap(weekStartISO, deload) {
    const t = MONTH_KM_CAPS[String(weekStartISO).slice(0, 7)];
    if (!t || !t.week) return null;
    return round1(deload ? t.week * 0.7 : t.week);
  }

  function capLongRunKm(km, weekStartISO, deload) {
    let cap = LONG_RUN_CAPS[weekStartISO];
    if (cap === undefined) cap = LONG_RUN_MONTH_CAPS[String(weekStartISO).slice(0, 7)];
    if (cap === undefined && weekStartISO > '2026-12-28') {
      // Joulukuun jälkeen: maltillinen jatko 15 km:stä +0,5 km/vk (ei hyppyä generaattorin arvoon)
      const weeks = Math.round(daysBetween(parseISO('2026-12-28'), parseISO(weekStartISO)) / 7);
      cap = round1(15 + 0.5 * weeks);
    }
    const mt = MONTH_KM_CAPS[String(weekStartISO).slice(0, 7)];
    if (mt && mt.long) cap = cap === undefined ? mt.long : Math.min(cap, mt.long);
    if (cap === undefined) return km;
    if (deload && !LONG_RUN_CAPS[weekStartISO]) cap = Math.min(cap, round1(cap * 0.7));
    return round1(Math.min(km, cap));
  }

  function easyRunKm(weeklyTarget, longKm, deload) {
    const remaining = Math.max(weeklyTarget - longKm, 10);
    let easy = remaining / 3;
    if (deload) easy *= 0.75;
    return round1(clamp(easy, 4, 16));
  }

  function weeklyVolumeTarget(baseWeekly, weekIndex, weeksToRace, deload) {
    // Hidas kasvu: ensimmäiset 4 vk pysyvät lähellä ~20–25 km/vk jos baseline ~19
    let v = baseWeekly;
    const growth = Math.min(weekIndex, 14);
    // ~5 %/vk alussa, myöhemmin ~6 %
    for (let i = 0; i < growth; i++) {
      v *= (i < 4 ? 1.04 : 1.055);
    }
    // Älä hyppää yli ~25 km ensimmäisillä 2 viikolla jos baseline ≤22
    if (weekIndex < 2 && baseWeekly <= 22) {
      v = Math.min(v, Math.max(baseWeekly, 22) + weekIndex * 2);
    }
    if (weeksToRace <= 2) v *= weeksToRace <= 1 ? 0.4 : 0.55;
    else if (weeksToRace <= 5) v *= 0.95;
    if (deload) v *= 0.7;
    return round1(clamp(v, 12, 90));
  }

  // --- Voimaharjoitukset (strukturoidut exercise-id:t) ---
  function formatStrengthDetails(tmpl) {
    const lines = [tmpl.headline || tmpl.name];
    if (tmpl.equipmentNote) lines.push(tmpl.equipmentNote);
    (tmpl.exercises || []).forEach(function (ex) {
      let line = '• ' + (ex.label || ex.id) + (ex.sets ? ' ' + ex.sets : '');
      if (ex.alt) line += ' (tai ' + ex.alt + ')';
      lines.push(line);
    });
    if (tmpl.restNote) lines.push(tmpl.restNote);
    if (tmpl.notes) lines.push(tmpl.notes);
    return lines.join('\n');
  }

  const STRENGTH_RAW = {
    gymA: {
      id: 'gymA',
      name: 'Voima A (sali)',
      location: 'sali',
      altId: 'homeA',
      headline: 'Koko keho A – sali (perusliikkeet, konservatiivinen RPE)',
      exercises: [
        { id: 'back_squat', label: 'Takakyykky', sets: '3×6–8 · RPE 6–7' },
        { id: 'bench_press', label: 'Penkkipunnerrus (tanko tai käsipainot)', sets: '3×6–8 · RPE 6–7' },
        { id: 'deadlift', label: 'Maastaveto', sets: '3×5 · RPE 6–7' },
        { id: 'lat_pulldown', label: 'Ylätalja', sets: '3×8–10 · RPE 6–7', altId: 'seated_cable_row', alt: 'alataljasoutu (kaapeli)' },
        { id: 'plank', label: 'Lankku', sets: '3×30–45 s' }
      ],
      restNote: 'Lepo 90–150 s.',
      notes:
        'Kuormat konservatiivisesti RPE 6–7 (2–4 toistoa varassa) – ei %1RM-arvailua (ei 1RM-dataa). ' +
        'Baseline: ~5 tiukkaa leuanvetoa, ~30–35 punnerrusta. Pidä tekniikka siistinä.'
    },
    gymB: {
      id: 'gymB',
      name: 'Voima B (sali)',
      location: 'sali',
      altId: 'homeB',
      headline: 'Koko keho B – sali (perusliikkeet, konservatiivinen RPE)',
      exercises: [
        { id: 'front_squat', label: 'Etukyykky', sets: '3×6–8 · RPE 6–7', altId: 'goblet_squat', alt: 'goblet-kyykky' },
        { id: 'incline_bench', label: 'Vinopenkki (tanko/käsipainot)', sets: '3×8 · RPE 6–7', altId: 'cable_chest_press', alt: 'kaapelipunnerrus' },
        { id: 'rdl', label: 'Romanian maastaveto', sets: '3×6–8 · RPE 6–7' },
        { id: 'bent_over_row', label: 'Kulmasoutu', sets: '3×8 · RPE 6–7', altId: 'seated_cable_row', alt: 'istuva kaapelisoutu' },
        { id: 'ball_rollout', label: 'Pallorullaus', sets: '3×8–10', altId: 'dead_bug', alt: 'dead bug' }
      ],
      restNote: 'Lepo 90–150 s.',
      notes:
        'RPE 6–7, ei raskaita %-kuormia. Yksinkertainen kokonaisuus. ' +
        'Jos edellinen päivä oli salibandy: lyhennä tai kevennä.'
    },
    homeA: {
      id: 'homeA',
      name: 'Voima A (koti)',
      location: 'koti',
      altId: 'gymA',
      headline: 'Koko keho A – koti (leuanveto + punnerrus baseline)',
      equipmentNote: 'Välineet: kuminauhat, säädettävät käsipainot ≤10 kg, leuanvetotanko, step-lauta, ab wheel.',
      exercises: [
        { id: 'goblet_squat', label: 'Goblet-kyykky (käsipainot)', sets: '3×10', altId: 'band_squat', alt: 'kuminauhakyykky' },
        { id: 'push_up', label: 'Punnerrus (kehonpaino)', sets: '3×10–15', altId: 'floor_press', alt: 'lattia-/korokepunnerrus käsipainoilla' },
        { id: 'rdl_db', label: 'Romanian maastaveto käsipainoilla (tai kuminauha)', sets: '3×10' },
        { id: 'pullup', label: 'Leuanveto (max ~5 tiukkaa)', sets: '3×3–5', altId: 'band_assisted_pullup', alt: 'kuminauha-avusteinen / scap-pull 3×5–8' },
        { id: 'ab_wheel', label: 'Ab wheel-rullaus (polvet ok)', sets: '3×6–10' }
      ],
      restNote: 'Lepo 60–90 s.',
      notes:
        'Leuanveto: aloita scap-pull + kuminauha-avusteisilla; lisää tiukkoja 3–5 toiston setteihin. ' +
        'Punnerrus: 3×10–15 kehonpainolla, etene toistoissa ennen lisävastusta. ' +
        'Baseline ~5 tiukkaa leuanvetoa / ~30–35 punnerrusta.'
    },
    homeB: {
      id: 'homeB',
      name: 'Voima B (koti)',
      location: 'koti',
      altId: 'gymB',
      headline: 'Koko keho B – koti',
      equipmentNote: 'Välineet: kuminauhat, käsipainot ≤10 kg, leuanvetotanko, step-lauta, ab wheel.',
      exercises: [
        { id: 'lunge', label: 'Askelkyykky step-laudalle / taakse (käsipainot)', sets: '3×8/puoli' },
        { id: 'push_up', label: 'Punnerrus (kehonpaino)', sets: '3×10–15', altId: 'band_press', alt: 'kuminauhapunnerrus / pystypunnerrus' },
        { id: 'single_leg_hip_thrust', label: 'Yhden jalan lantionnosto stepillä', sets: '3×8/puoli' },
        { id: 'band_row', label: 'Kuminauhasoutu', sets: '3×10', altId: 'inverted_row', alt: 'inverted row tangolla' },
        { id: 'scap_pull', label: 'Scap-pull / kuminauha-leuanveto', sets: '3×5–8', altId: 'band_assisted_pullup', alt: 'band-assisted pull-up' },
        { id: 'calf_raise', label: 'Pohjenosto step-laudalla', sets: '3×12' },
        { id: 'ab_wheel', label: 'Ab wheel', sets: '3×6–10', altId: 'plank', alt: 'lankku 3×30–45 s' }
      ],
      restNote: 'Lepo 60–90 s.',
      notes:
        'Käytä vain listattuja välineitä. Punnerrusvolyymi ~3×10–15. ' +
        'Leuanvetokehitys: scap-pull → band-assisted → tiukat 3–5 toiston setit.'
    }
  };

  function finalizeStrength(raw) {
    const s = Object.assign({}, raw);
    s.details = formatStrengthDetails(raw);
    return s;
  }

  const STRENGTH = {
    gymA: finalizeStrength(STRENGTH_RAW.gymA),
    gymB: finalizeStrength(STRENGTH_RAW.gymB),
    homeA: finalizeStrength(STRENGTH_RAW.homeA),
    homeB: finalizeStrength(STRENGTH_RAW.homeB)
  };


  // --- Lämmittely & liikkuvuus ---
  function cloneBlock(b) {
    return JSON.parse(JSON.stringify(b));
  }

  const WARMUP_TEMPLATES = {
    run: {
      id: 'warmup_run',
      label: 'Lämmittely',
      durationMin: 8,
      note: '5–10 min: kevyt cardio + dynaaminen liikkuvuus ennen juoksua.',
      exercises: [
        { id: 'light_jog', label: 'Kevyt hölkkä / askellus', sets: '2–3 min' },
        { id: 'leg_swings', label: 'Jalanheilautukset', sets: '10/puoli' },
        { id: 'hip_opener', label: 'Lonkan avaukset', sets: '8/puoli' },
        { id: 'ankle_mobility', label: 'Nilkan liikkuvuus', sets: '8/puoli' },
        { id: 'worlds_greatest_stretch', label: "World's greatest stretch", sets: '3–4/puoli' }
      ]
    },
    strength: {
      id: 'warmup_strength',
      label: 'Lämmittely',
      durationMin: 8,
      note: '5–10 min: kevyt cardio + dynaaminen liikkuvuus ennen voimaa.',
      exercises: [
        { id: 'light_jog', label: 'Kevyt askellus / polvennostot', sets: '2 min' },
        { id: 'arm_circles', label: 'Käsien pyöritykset', sets: '10/suunta' },
        { id: 'thoracic_opener', label: 'Rintarangan avaukset', sets: '6/puoli' },
        { id: 'bw_squat_warmup', label: 'Kehonpainokyykky', sets: '8–10' },
        { id: 'glute_activation', label: 'Pakara-aktivointi', sets: '10–12' },
        { id: 'worlds_greatest_stretch', label: "World's greatest stretch", sets: '3/puoli' }
      ]
    }
  };

  const MOBILITY_TEMPLATES = {
    run: {
      id: 'mobility_run',
      label: 'Liikkuvuus / venyttely',
      optional: true,
      teeMyos: true,
      durationMin: 8,
      note: 'Vapaaehtoinen cooldown juoksun jälkeen – voit ohittaa.',
      exercises: [
        { id: 'calf_stretch', label: 'Pohjevenytys', sets: '20–30 s/puoli' },
        { id: 'hip_flexor_stretch', label: 'Lonkan koukistajan venytys', sets: '20–40 s/puoli' },
        { id: 'quad_stretch', label: 'Etureiden venytys', sets: '20–30 s/puoli' },
        { id: 'hamstring_stretch', label: 'Takareiden venytys', sets: '20–30 s/puoli' },
        { id: 'figure4_stretch', label: 'Figure-4 / pakara', sets: '20–40 s/puoli' }
      ]
    },
    strength: {
      id: 'mobility_strength',
      label: 'Liikkuvuus / venyttely',
      optional: true,
      teeMyos: true,
      durationMin: 6,
      note: 'Vapaaehtoinen – tee myös jos ehdit, tai ohita.',
      exercises: [
        { id: 'hip_flexor_stretch', label: 'Lonkan koukistajan venytys', sets: '20–30 s/puoli' },
        { id: 'thoracic_opener', label: 'Rintarangan avaukset', sets: '6/puoli' },
        { id: 'hamstring_stretch', label: 'Takareiden venytys', sets: '20–30 s/puoli' },
        { id: 'childs_pose', label: 'Lapsen asento', sets: '30–60 s' }
      ]
    },
    gentle: {
      id: 'mobility_gentle',
      label: 'Kevyt liikkuvuus',
      optional: true,
      teeMyos: true,
      durationMin: 10,
      note: 'Lempeä vaihtoehto lepo-/sairaspäivänä. Ei treeniä – vain liike ja hengitys.',
      exercises: [
        { id: 'cat_cow', label: 'Kissa–lehmä', sets: '8–12' },
        { id: 'thoracic_opener', label: 'Rintarangan avaukset', sets: '6/puoli' },
        { id: 'hip_opener', label: 'Lonkan avaukset', sets: '6/puoli' },
        { id: 'childs_pose', label: 'Lapsen asento', sets: '45–60 s' },
        { id: 'calf_stretch', label: 'Pohjevenytys (kevyt)', sets: '20 s/puoli' }
      ]
    }
  };

  function warmupFor(kind, shortened) {
    const base = cloneBlock(WARMUP_TEMPLATES[kind] || WARMUP_TEMPLATES.run);
    if (shortened) {
      base.durationMin = 5;
      base.note = 'Lyhennetty lämmittely (~5 min) kevennyksen yhteydessä.';
      base.exercises = base.exercises.slice(0, Math.min(4, base.exercises.length));
    }
    return base;
  }

  function mobilityFor(kind) {
    return cloneBlock(MOBILITY_TEMPLATES[kind] || MOBILITY_TEMPLATES.run);
  }

  function attachPrep(session) {
    if (!session) return session;
    if (session.type === 'run' || session.type === 'race') {
      session.warmup = warmupFor('run', false);
      session.mobility = mobilityFor('run');
    } else if (session.type === 'strength') {
      session.warmup = warmupFor('strength', false);
      session.mobility = mobilityFor('strength');
    } else if (session.type === 'rest') {
      session.mobility = mobilityFor('gentle');
      // no mandatory warmup on rest
    }
    return session;
  }

  function strengthFor(weekIndex, preferLocation) {
    const isA = weekIndex % 2 === 0;
    if (preferLocation === 'koti') {
      return isA ? { ...STRENGTH.homeA } : { ...STRENGTH.homeB };
    }
    return isA ? { ...STRENGTH.gymA } : { ...STRENGTH.gymB };
  }

  function shortStrength(s) {
    const exercises = (s.exercises || []).slice(0, 4).map(function (ex) {
      return Object.assign({}, ex, { sets: '2×8–10' });
    });
    const base = Object.assign({}, s, {
      name: s.name + ' – lyhyt',
      exercises: exercises,
      restNote: 'Lepo 60 s.',
      notes: 'Lyhennetty 20–25 min. Tavoite: ylläpitää rutiinia, ei uuvuttaa.',
      headline: 'Lyhennetty 20–25 min'
    });
    base.details = formatStrengthDetails(base);
    return base;
  }

  /** Kynnysvedot ohjataan vauhdilla, ei sykkeellä (rannesyke laahaa vedon alussa → liian kova alku). */
  const THRESHOLD_PACE = '5:15–5:35';
  const THRESHOLD_TIP = 'Tavoite vauhti 5:15–5:35/km, syke vain jälkikäteen seurantaan; ylämäessä tuntuman mukaan, anna vauhdin hidastua; eka kilsa tarkoituksella 5:25, 3. vedon oltava yhtä nopea kuin 1.';

  function qualitySession(phase, fitness) {
    if (phase.id === 'base') {
      return {
        type: 'run',
        subtype: 'strides',
        name: 'Helppo + kiihdytykset',
        distanceKm: round1(fitness.weekly * 0.2),
        cueIds: ['easy_run_form', 'strides_cues'],
        details:
          'Helppo vauhti (syke 115–138) + 4–6 × 20 s kiihdytystä\n' +
          'Palautus kävellen/hölkäten 60–90 s kiihdytysten välillä.\n' +
          'Tuntuma kevyt, ei anaerobista.'
      };
    }
    if (phase.id === 'build') {
      return {
        type: 'run',
        subtype: 'tempo',
        name: 'Tempo / kynnys',
        distanceKm: round1(clamp(fitness.weekly * 0.22, 6, 14)),
        cueIds: ['tempo_cues', 'easy_run_form'],
        details:
          '15 min lämmittely (syke 115–138) → 3 × 8 min kynnys, palautus 2 min hölkkä/kävely → 10 min jäähdyttely.\n' +
          THRESHOLD_TIP + '\n' +
          'Kellossa vedoille VAUHTI-tavoite, ei syke (rannesyke laahaa 1–2 min vedon alussa).'
      };
    }
    if (phase.id === 'peak') {
      return {
        type: 'run',
        subtype: 'intervals',
        name: 'Intervallit',
        distanceKm: round1(clamp(fitness.weekly * 0.2, 6, 12)),
        cueIds: ['interval_cues'],
        details:
          'Lämmittely 15 min → 5–6 × 3–4 min reipas\n' +
          '(10 km -vauhdin tuntuma) / 2 min hölkkä tai kävely → jäähdyttely.\n' +
          'Kellossa vedoille VAUHTI-tavoite, syke vain jälkikäteen; ylämäessä tuntuman mukaan, viimeinen veto yhtä nopea kuin eka.\n' +
          'Tai 8–10 × 400–600 m, jos rata käytettävissä.'
      };
    }
    // taper
    return {
      type: 'run',
      subtype: 'strides',
      name: 'Avoimet jalat',
      distanceKm: 6,
      cueIds: ['strides_cues', 'easy_run_form'],
      details:
        'Helppo 5–6 km (syke 115–138) + 4 × 15–20 s kevyt kiihdytys.\n' +
        'Pidä kevyenä – kilpailuviikko / taper.'
    };
  }

  /** Kevyiden, palauttavien ja pitkien lenkkien sykeikkuna (bpm). Kynnys/intervallit erikseen. */
  const EASY_HR = [115, 138];
  const EASY_HR_TEXT = 'Syke 115–138: väsyneenä ja palauttavilla pysy alapäässä, pitkällä yläpää ok – kello hälyttää vasta yli 138.';

  // --- Välitavoitteet: kuntotestit + B-kisa (julkista dataa: päivä, matka, ohje – ei tuloksia) ---
  /**
   * Kiinteät välitavoitteet. Generaattori huomioi nämä päiväkohtaisesti (milestoneAdjust):
   *  testi: testipäivä korvaa päivän treenin, samalla viikolla ei kynnystä/intervalleja ennen testiä,
   *         päivää ennen kevyt, lauantain testin jälkeen pitkä siirtyy sunnuntaille.
   *  kisa:  kisaviikolla ei kovaa (avoimet jalat), voima lyhyenä, kevyet −30 %; 3 palauttavaa päivää jälkeen.
   * Tulokset kirjataan vain omaan laitteeseen (päivän muistiinpano), ei tähän tiedostoon.
   */
  const MILESTONES_VERSION = 1;
  const HCH_URL = 'https://helsinkicityrun.fi/helsinkicityhalf-puolimaraton/';
  const MILESTONES = [
    {
      id: 'test5k-2026-11', date: '2026-11-21', kind: 'test', icon: '⏱️', name: '5 km testi', testKm: 5, totalKm: 8.5,
      short: 'Kuntotesti 5 km (lähtötaso)',
      details: 'Verkka 15 min (syke 115–138) + 3–4 rentoa 20 s vetoa → 5 km all-out TASAVAUHTISESTI ' +
        '(eka kilsa maltilla, ei ylilähtöä, viimeinen kilsa kovin) → loppuverkka 10 min hölkkä.\n' +
        'Tasainen reitti tai rata – sama reitti kesäkuun vertailutestissä (19.6.2027).\n' +
        'Kirjaa aika päivän muistiinpanoon (jää vain omaan laitteeseen).'
    },
    {
      id: 'cooper-2027-01', date: '2027-01-15', kind: 'test', icon: '⏱️', name: 'Cooper-testi 12 min', totalKm: 6,
      short: 'Kuntotesti Cooper 12 min',
      details: 'Verkka 15 min (syke 115–138) + 3 rentoa vetoa → 12 min mahdollisimman pitkälle tasaisella vauhdilla → loppuverkka 10 min.\n' +
        'Pito ratkaisee: kuiva tie, sisärata tai juoksumatto 1 % kulmalla (ei liukasta tietä).\n' +
        'Kirjaa matka metreinä päivän muistiinpanoon.'
    },
    {
      id: 'test10k-2027-03', date: '2027-03-13', kind: 'test', icon: '⏱️', name: '10 km testi', testKm: 10, totalKm: 13.5,
      short: 'Kuntotesti 10 km',
      details: 'Verkka 15 min (syke 115–138) + 3–4 rentoa vetoa → 10 km all-out tasavauhtisesti ' +
        '(ensimmäiset 3 km maltilla, viimeiset 2 km kovin) → loppuverkka 10 min.\n' +
        'Antaa puolimaratonin (8.5.) tavoitevauhdin. Kirjaa aika päivän muistiinpanoon.'
    },
    {
      id: 'hch-2027', date: '2027-05-08', kind: 'race', icon: '🏅', name: 'Helsinki City Half 21,1 km',
      fullName: 'OP Uusimaa Helsinki City Half (puolimaraton)', short: 'Välikisa: puolimaraton',
      distanceKm: 21.1, totalKm: 23, startTime: '14.20', place: 'Helsinki', goal: '~1:50–1:52', url: HCH_URL,
      details: 'OP Uusimaa Helsinki City Half, Helsinki · lähtö klo 14.20.\n' +
        'Tavoite ~1:50–1:52 (≈ 5:13–5:18/km). Ensimmäiset 5 km maltilla ~5:20/km, sitten tasaisesti; viimeiset 5 km saa kiristää.\n' +
        'Verkka 10–15 min hölkkä + 3 rentoa vetoa. Kunnon ateria ~3–4 h ennen lähtöä, juo huoltopisteillä.\n' +
        'B-kisa ja harjoituskisa – päätavoite on Paavo Nurmi Marathon 21.8.2027.'
    },
    {
      id: 'test5k-2027-06', date: '2027-06-19', kind: 'test', icon: '⏱️', name: '5 km testi', testKm: 5, totalKm: 8.5,
      short: 'Kuntotesti 5 km (vertailu marraskuuhun)', compareTo: 'test5k-2026-11',
      details: 'Sama protokolla ja mieluiten sama reitti kuin 21.11.2026: verkka 15 min (syke 115–138) + 3–4 vetoa → ' +
        '5 km all-out tasavauhtisesti → loppuverkka 10 min.\nVertaa aikaa marraskuun testiin. Kirjaa aika päivän muistiinpanoon.'
    },
    {
      id: 'test10k-2027-07', date: '2027-07-17', kind: 'test', icon: '⏱️', name: '10 km testi', testKm: 10, totalKm: 13.5,
      short: 'Kuntotesti 10 km (~5 vk ennen maratonia)', compareTo: 'test10k-2027-03',
      details: 'Verkka 15 min (syke 115–138) + 3–4 vetoa → 10 km all-out tasavauhtisesti → loppuverkka 10 min.\n' +
        '~5 vk ennen maratonia: tulos tarkentaa maratonvauhdin (sub 4 h ≈ 5:41/km). Vertaa maaliskuun testiin. Kirjaa aika muistiinpanoon.'
    }
  ];

  function milestoneOn(iso) {
    for (let i = 0; i < MILESTONES.length; i++) if (MILESTONES[i].date === iso) return MILESTONES[i];
    return null;
  }

  /** Tulevat välitavoitteet (sis. tämän päivän) päivämääräjärjestyksessä. */
  function upcomingMilestones(fromIso, limit) {
    const list = MILESTONES.filter(function (m) { return m.date >= fromIso; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return limit ? list.slice(0, limit) : list;
  }

  function milestoneSession(m) {
    if (m.kind === 'race') {
      return {
        type: 'race', subtype: 'halfmarathon', name: m.icon + ' ' + m.name + ' (välikisa)',
        distanceKm: m.distanceKm, milestone: m.id, url: m.url, cueIds: ['easy_run_form'], details: m.details
      };
    }
    return {
      type: 'run', subtype: 'test', name: m.icon + ' ' + m.name + ' (kuntotesti)',
      distanceKm: m.totalKm, milestone: m.id, cueIds: ['easy_run_form'], details: m.details
    };
  }

  function isHardRun(s) {
    return !!s && s.type === 'run' && (s.subtype === 'tempo' || s.subtype === 'intervals');
  }

  function easyMilestoneRun(name, km, why) {
    return {
      type: 'run', subtype: 'easy', name: name, distanceKm: km, cueIds: ['easy_run_form'], hrTarget: EASY_HR.slice(),
      details: 'Kevyt ' + km + ' km, syke 115–138 (alapäässä).\n' + why
    };
  }

  function shortStrengthSession(session) {
    const sh = shortStrength(session);
    return Object.assign({}, sh, {
      type: 'strength', subtype: session.subtype, location: session.location, altId: session.altId, durationMin: 25
    });
  }

  /**
   * Generaattorin päiväkohtainen hook välitavoitteille. ctx: { longKm, easyKm }.
   * Palauttaa (mahdollisesti) korvatun session.
   */
  function milestoneAdjust(session, iso, ctx) {
    const d = parseISO(iso);
    const here = milestoneOn(iso);
    if (here) return milestoneSession(here);
    for (let i = 0; i < MILESTONES.length; i++) {
      const m = MILESTONES[i];
      const md = parseISO(m.date);
      const k = daysBetween(d, md); // >0: ennen välitavoitetta, <0: jälkeen
      if (k > 7 || k < -5) continue;
      const sameWeek = toISO(startOfWeek(d)) === toISO(startOfWeek(md));
      if (m.kind === 'test') {
        if (k === 1) {
          if (session && session.type === 'run' && session.subtype !== 'easy') {
            return easyMilestoneRun('Kevyt testiä edeltävänä päivänä', round1(Math.min(ctx.easyKm || 5, 5)),
              'Huomenna ' + m.name + ' – tänään vain rento hölkkä (+ halutessa 3 × 15 s rennot vedot).');
          }
          if (session && session.type === 'strength') return shortStrengthSession(session);
        } else if (k > 1 && sameWeek && isHardRun(session)) {
          return Object.assign(easyMilestoneRun('Helppo + kiihdytykset (testiviikko)', round1(Math.min(ctx.easyKm || 6, 7)),
            'Testiviikko: ' + m.name + ' ' + DOW_FI[md.getDay()] + ' on viikon kova – ei kynnystä tänään.\nLopuksi 4 × 20 s rennot kiihdytykset.'),
          { subtype: 'strides' });
        } else if (k === -1 && md.getDay() === 6 && d.getDay() === 0 && ctx.longKm) {
          // Lauantain testi korvasi pitkän → pitkä sunnuntaille (10 km testin jälkeen lyhyempi)
          const km = round1(m.testKm >= 10 ? ctx.longKm * 0.7 : ctx.longKm);
          return {
            type: 'run', subtype: 'long', name: 'Pitkä kevyt (siirretty testin jälkeen)', distanceKm: km,
            cueIds: ['long_run_cues', 'easy_run_form'], hrTarget: EASY_HR.slice(),
            details: 'Pitkä lenkki n. ' + km + ' km – siirretty lauantailta testin takia.\n' +
              'Syke 115–138, eilisen testin jälkeen rauhallisesti alapäässä. Kävelykatkot ok.'
          };
        } else if (k === -1 && isHardRun(session)) {
          return easyMilestoneRun('Palauttava (testin jälkeen)', round1(Math.min(ctx.easyKm || 5, 6)), 'Eilen testi – tänään kevyesti.');
        }
      } else if (m.kind === 'race') {
        if (k >= 1 && k <= 6 && sameWeek) {
          if (isHardRun(session) || (session && session.type === 'run' && session.subtype === 'strides')) {
            return Object.assign(easyMilestoneRun('Avoimet jalat (kisaviikko)', 5,
              'Kisaviikko: ' + m.name + ' ' + DOW_FI[md.getDay()] + ' – ei kovaa 4 vrk ennen.\nLopuksi 4 × 15–20 s rennot kiihdytykset.'),
            { subtype: 'strides' });
          }
          if (session && session.type === 'run') {
            const km = round1(Math.max(3, Math.min((session.distanceKm || 5) * 0.7, k <= 1 ? 4 : 6)));
            return easyMilestoneRun(k === 1 ? 'Kevyt 20–25 min (kisaa edeltävä päivä)' : 'Kevyt (kisaviikko)', k === 1 ? Math.min(km, 4) : km,
              'Kisaviikko: määrä −30 %, vauhti kevyt. ' + (k === 1 ? 'Halutessa 3 × 15 s rennot vedot. Tai lepo.' : ''));
          }
          if (session && session.type === 'strength') return shortStrengthSession(session);
        } else if (k === -1) {
          return {
            type: 'rest', subtype: 'rest', name: 'Palautus: lepo / kävely (kisan jälkeen)',
            details: 'Eilen puolimaraton. Lepo tai 20–40 min kävely, kevyt liikkuvuus. Syö ja juo hyvin.'
          };
        } else if (k <= -2 && k >= -3) {
          if (session && (session.type === 'run' || session.type === 'race')) {
            return easyMilestoneRun('Palauttava kevyt (kisan jälkeen)', round1(Math.min(session.distanceKm || 4, 5)),
              'Puolimaratonin jälkeinen palautus: lyhyt ja kevyt, tai kävely jos jalat ovat jumissa.');
          }
          if (session && session.type === 'strength') return shortStrengthSession(session);
        } else if (k === -4 && isHardRun(session)) {
          return easyMilestoneRun('Helppo (palautus kisasta)', round1(Math.min(ctx.easyKm || 6, 6)),
            'Ei vielä kovaa – laatu palaa ensi viikolla.');
        }
      }
    }
    return session;
  }

  /**
   * Viikkorakenne (ma–su):
   * ma: helppo TAI lepo
   * ti: voima
   * ke: laatu / helppo
   * to: voima (tai lyhyt helppo)
   * pe: lepo / helppo
   * la: pitkä
   * su: helppo TAI voima (vaihtoehto)
   */
  function buildWeekPlan(weekStart, weekIndex, raceDate, settings, fitness) {
    const weeksToRace = Math.ceil(daysBetween(weekStart, raceDate) / 7);
    const phase = getPhase(weeksToRace);
    const deload = isDeloadWeekDate(weekStart) && phase.id !== 'taper';
    const weekCap = weeksToRace > 2 ? weeklyKmCap(toISO(weekStart), deload) : null;
    let vol = weeklyVolumeTarget(fitness.weekly, weekIndex, weeksToRace, deload);
    if (weekCap) vol = Math.min(vol, weekCap);
    const longKm = capLongRunKm(longRunKm(fitness.longest, weekIndex, weeksToRace, deload), toISO(weekStart), deload);
    let easyKm = easyRunKm(vol, longKm, deload);
    const prefer = settings.strengthLocation || 'sali';
    const quality = qualitySession(phase, fitness);
    if (weekCap) {
      // Viikon juoksut ≈ helppo + laatu + pitkä + palauttava (0,7 × helppo) ≤ kuukausitavoitteen viikkokatto
      const room = (weekCap - longKm - ((quality && quality.distanceKm) || 0)) / 1.7;
      easyKm = round1(Math.max(3, Math.min(easyKm, room)));
    }

    const days = [];
    let weekBaseKm = 0; // viikon juoksukm ennen välitavoitemuutoksia
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const iso = toISO(date);
      const dow = date.getDay(); // 0=su ... 6=la
      let session = null;

      // ma (1): helppo
      if (dow === 1) {
        session = {
          type: 'run',
          subtype: 'easy',
          name: 'Helppo lenkki',
          distanceKm: easyKm,
          cueIds: ['easy_run_form'],
          hrTarget: EASY_HR.slice(),
          details: `Helppo vauhti n. ${easyKm} km.\n${EASY_HR_TEXT}\nHengitys rauhallinen, voit jutella koko matkan.\nJos väsynyt: lyhennä 30 % tai kävelykatkot ok.`
        };
      }
      // ti (2): voima
      else if (dow === 2) {
        const s = strengthFor(weekIndex, prefer);
        session = {
          type: 'strength',
          subtype: s.id,
          name: s.name,
          location: s.location,
          altId: s.altId,
          details: s.details,
          exercises: s.exercises,
          restNote: s.restNote,
          notes: s.notes,
          headline: s.headline,
          equipmentNote: s.equipmentNote,
          durationMin: 60
        };
      }
      // ke (3): laatu
      else if (dow === 3) {
        session = {
          type: 'run',
          subtype: quality.subtype,
          name: quality.name,
          distanceKm: quality.distanceKm,
          cueIds: quality.cueIds,
          details: quality.details
        };
      }
      // to (4): voima B / toinen voima
      else if (dow === 4) {
        const s = strengthFor(weekIndex + 1, prefer);
        session = {
          type: 'strength',
          subtype: s.id,
          name: s.name,
          location: s.location,
          altId: s.altId,
          details: s.details,
          exercises: s.exercises,
          restNote: s.restNote,
          notes: s.notes,
          headline: s.headline,
          equipmentNote: s.equipmentNote,
          durationMin: 60
        };
      }
      // pe (5): lepo
      else if (dow === 5) {
        session = {
          type: 'rest',
          subtype: 'rest',
          name: 'Lepo / palautus',
          details:
            'Täysi lepo tai kevyt kävely 20–30 min.\n' +
            'Hyvä uni ja ravinto – vuorotyössä tämä on tärkeää.'
        };
      }
      // la (6): pitkä
      else if (dow === 6) {
        session = {
          type: 'run',
          subtype: 'long',
          name: 'Pitkä lenkki',
          distanceKm: longKm,
          cueIds: ['long_run_cues', 'easy_run_form'],
          hrTarget: EASY_HR.slice(),
          details:
            `Pitkä lenkki n. ${longKm} km.\n` +
            'Syke 115–138: yläpää ok pitkällä, kello hälyttää vasta yli 138.\n' +
            'Aloita rauhallisesti, pidä vauhti helppona koko matkan.\n' +
            'Ota mukaan juotavaa jos yli 90 min. Kävelykatkot ok.'
        };
      }
      // su (0): helppo / aktiivinen palautus
      else if (dow === 0) {
        const shortEasy = round1(easyKm * 0.7);
        session = {
          type: 'run',
          subtype: 'easy',
          name: 'Palauttava lenkki',
          distanceKm: shortEasy,
          cueIds: ['easy_run_form'],
          hrTarget: EASY_HR.slice(),
          details: `Kevyt ${shortEasy} km tai vaihtoehtoisesti lepo.\nSyke 115–138, palauttavalla pysy alapäässä.\nJos pitkä lenkki jäi raskaaksi: lepo tänään.`
        };
      }

      // Salibandy-ilta: kova kuormituspäivä – älä pidä laatutreeniä samana / seuraavana aamuna
      const saliDow = settings.salibandyDow;
      const saliSet = saliDow !== null && saliDow !== undefined && saliDow !== '' && saliDow !== 'none';
      if (saliSet && session) {
        const sd = +saliDow;
        if (dow === sd) {
          // Salibandy-päivä: merkitse ja korvaa laatu/kova juoksu helpolla tai levolla
          if (session.type === 'run' && (session.subtype === 'tempo' || session.subtype === 'intervals' || session.subtype === 'strides')) {
            session = {
              type: 'run',
              subtype: 'easy',
              name: 'Helppo (salibandy-ilta)',
              distanceKm: round1(Math.min(easyKm, 6)),
              cueIds: ['easy_run_form'],
              details:
                'Salibandy-ilta = kova TE-päivä.\n' +
                'Laatutreeni siirretty / jätetty väliin. Jos juokset, pidä hyvin kevyenä (~' + round1(Math.min(easyKm, 6)) + ' km).\n' +
                'Syke 115–138, pysy alapäässä.\n' +
                'Salibandy riittää viikon kovaksi ärsykkeeksi.'
            };
          } else if (session.type === 'rest') {
            session = Object.assign({}, session, {
              name: 'Salibandy / lepo',
              subtype: 'salibandy',
              details:
                (session.details || '') +
                '\n\n🏒 Salibandy-ilta: merkitse tehdyksi jos pelasit. Lasketaan kovaksi treeniksi (TE jopa 5.0).'
            });
          } else if (session.type === 'strength') {
            // Salibandy on päivän kova ärsyke – ei raskasta voimaa samaan päivään
            session = {
              type: 'rest',
              subtype: 'salibandy',
              name: 'Salibandy',
              details:
                '🏒 Salibandy-ilta = päivän treeni (kova kuormitus).\n' +
                'Ei voimaa samana päivänä. Lämmittele kunnolla ennen peliä ja venyttele sen jälkeen.',
              mobility: mobilityFor('gentle')
            };
          } else if (session.type === 'run' && session.subtype === 'easy') {
            session = Object.assign({}, session, {
              name: session.name + ' (salibandy-ilta)',
              details:
                (session.details || '') +
                '\n\n🏒 Salibandy-ilta: lyhennä tai jätä juoksu väliin jos peli oli raskas.'
            });
          }
          session.salibandyDay = true;
        }
        // Seuraava aamu salibandyn jälkeen: kevennä laatua
        const nextAfterSali = (sd + 1) % 7;
        if (dow === nextAfterSali && session.type === 'run' &&
            (session.subtype === 'tempo' || session.subtype === 'intervals')) {
          session = {
            type: 'run',
            subtype: 'easy',
            name: 'Helppo (palautus salibandyn jälkeen)',
            distanceKm: round1(Math.min(easyKm, 7)),
            cueIds: ['easy_run_form'],
            details:
              'Eilinen salibandy oli kova kuormitus.\n' +
              'Pidä tänään helppona (~' + round1(Math.min(easyKm, 7)) + ' km) – laatutreeni toisena päivänä.\n' +
              'Syke 115–138, pysy alapäässä.'
          };
        }
      }

      // Viikkohuomio kaikkiin päiviin (suunnitelmamuistiinpano)
      if (session && session.details && weekIndex === 0 && i === 0) {
        // annotated on first day only via week tip; also stamp long run
      }
      if (session && session.subtype === 'long') {
        session.details = (session.details || '') +
          '\n\nHuom: salibandy lasketaan kovaksi päiväksi – älä pinnoita laatua + pitkää + salibandyä samaan viikonloppuun.';
      }

      // Taper: vähennä ti-voimaa kevyeksi
      if (phase.id === 'taper' && session && session.type === 'strength') {
        const shortened = shortStrength(session);
        session = Object.assign({}, shortened, {
          type: 'strength',
          subtype: session.subtype,
          location: session.location,
          altId: session.altId,
          durationMin: 25
        });
      }

      // Välitavoitteet (kuntotestit, B-kisa): testipäivä korvaa treenin, taper/palautus ympärille
      if (session && (session.type === 'run' || session.type === 'race')) weekBaseKm += session.distanceKm || 0;
      session = milestoneAdjust(session, iso, { longKm: longKm, easyKm: easyKm });

      // Kilpailupäivä
      if (iso === toISO(raceDate)) {
        session = {
          type: 'race',
          subtype: 'marathon',
          name: 'Paavo Nurmi Marathon 🏁',
          distanceKm: 42.2,
          details:
            'Kilpailupäivä – Paavo Nurmi Marathon, Turku!\n' +
            'Luota harjoitteluun. Aloita rauhallisesti.\n' +
            'Nauti matkasta. Onnea!'
        };
      }

      if (session) attachPrep(session);

      days.push({
        date: iso,
        dow,
        dowLabel: DOW_FULL[dow],
        weekIndex,
        phase: phase.id,
        phaseName: phase.name,
        deload,
        planned: session,
        // Runtime fields filled by app:
        status: null,
        completed: false,
        modified: null,
        note: ''
      });
    }

    // Testiviikko: testi + siirretty pitkä voivat nostaa viikkokm:iä → pidä ≈ normaaliviikon tasolla (ja ≤ kk-katto):
    // leikkaa ensin kevyistä (min 3 km), sitten pitkästä. Kisaviikkoa (B-kisa) ei leikata – kisa on kisa.
    const msDays = days.filter(function (x) { return x.planned && x.planned.milestone; });
    const weekLimit = Math.min(weekCap || Infinity, round1(weekBaseKm + 1));
    if (msDays.length && msDays.every(function (x) { return x.planned.type !== 'race'; }) && isFinite(weekLimit)) {
      const weekCapX = weekLimit;
      const runKm = function () {
        return days.reduce(function (a, x) {
          return a + (x.planned && (x.planned.type === 'run' || x.planned.type === 'race') ? (x.planned.distanceKm || 0) : 0);
        }, 0);
      };
      let over = runKm() - weekCapX;
      const easyDays = days.filter(function (x) {
        return x.planned && x.planned.type === 'run' && !x.planned.milestone && x.planned.subtype !== 'long';
      }).sort(function (a, b) { return (b.planned.distanceKm || 0) - (a.planned.distanceKm || 0); });
      for (let j = 0; j < easyDays.length && over > 0.05; j++) {
        const pl = easyDays[j].planned;
        const cut = Math.min(over, Math.max(0, (pl.distanceKm || 0) - 3));
        if (cut <= 0) continue;
        pl.distanceKm = round1(pl.distanceKm - cut);
        pl.details = (pl.details || '').replace(/\d+(?:\.\d+)? km/, pl.distanceKm + ' km');
        over = runKm() - weekCapX;
      }
      const longDay = days.find(function (x) { return x.planned && x.planned.subtype === 'long' && !x.planned.milestone; });
      if (over > 0.05 && longDay) {
        longDay.planned.distanceKm = round1(Math.max(6, longDay.planned.distanceKm - over));
        longDay.planned.details = (longDay.planned.details || '').replace(/\d+(?:\.\d+)? km/, longDay.planned.distanceKm + ' km');
      }
    }

    return {
      weekStart: toISO(weekStart),
      weekIndex,
      weeksToRace,
      phase: phase.id,
      phaseName: phase.name,
      deload,
      deloadLabel: deload ? DELOAD_LABEL : '',
      deloadNote: deload ? deloadNote(toISO(weekStart)) : '',
      deloadAnchor: DELOAD_ANCHOR,
      volumeTargetKm: vol,
      days
    };
  }

  /**
   * Generoi näkyvän suunnitelman: tästä viikosta eteenpäin
   * max 16 viikkoa TAI kilpailuun asti.
   */
  function generatePlan(settings, garmin) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const raceDate = parseISO(settings.raceDate || '2027-08-21');
    const fitness = fitnessBaseline(settings.fitnessLevel || 'keskitaso', garmin);
    const week0 = startOfWeek(today);

    // weekIndex suhteessa "ohjelman alkuun" – käytä viikkoja kilpailuun
    // käänteisesti: mitä lähempänä kisaa, sitä korkeampi "progressio"
    // Käytännössä: laske montako viikkoa on kulunut hypoteettisesta 20 vk ohjelmasta
    const totalWeeksToRace = Math.max(1, Math.ceil(daysBetween(week0, raceDate) / 7));
    const programLength = 20;
    const baseWeekOffset = Math.max(0, programLength - totalWeeksToRace);

    const weeksToShow = Math.min(16, totalWeeksToRace + 1);
    const weeks = [];
    for (let w = 0; w < weeksToShow; w++) {
      const ws = addDays(week0, w * 7);
      if (ws > addDays(raceDate, 7)) break;
      weeks.push(buildWeekPlan(ws, baseWeekOffset + w, raceDate, settings, fitness));
    }

    return {
      generatedAt: new Date().toISOString(),
      raceDate: toISO(raceDate),
      raceName: settings.raceName || 'Paavo Nurmi Marathon 2027',
      milestonesVersion: MILESTONES_VERSION,
      fitness,
      weeks
    };
  }

  function getDayFromPlan(plan, isoDate) {
    for (const w of plan.weeks) {
      for (const d of w.days) {
        if (d.date === isoDate) return { day: d, week: w };
      }
    }
    return null;
  }

  function applyKeventa(session) {
    if (!session) return session;
    const s = JSON.parse(JSON.stringify(session));
    s.modified = 'keventa';
    if (s.type === 'run' && s.distanceKm) {
      s.distanceKm = round1(s.distanceKm * 0.7);
      s.name = s.name + ' (kevennetty)';
      s.details = 'KEVENNETTY (−30 %)\n' + (s.details || '') +
        `\n→ Matka n. ${s.distanceKm} km, pidä vauhti helppona.`;
      s.warmup = warmupFor('run', true);
    } else if (s.type === 'strength') {
      s.durationMin = Math.round((s.durationMin || 60) * 0.7);
      s.name = s.name + ' (kevennetty)';
      if (s.exercises && s.exercises.length) {
        s.exercises = s.exercises.map(function (ex) {
          return Object.assign({}, ex, { sets: '2 sarjaa (kevennetty)' });
        });
        s.notes = 'KEVENNETTY (−30 %). Tee 2 sarjaa / liike, hieman kevyemmällä kuormalla. ' + (s.notes || '');
        s.details = formatStrengthDetails(s);
      } else {
        s.details = 'KEVENNETTY (−30 % sarjat/toistot)\n' +
          'Tee 2 sarjaa / liike, hieman kevyemmällä kuormalla.\n' +
          (s.details || '');
      }
      s.warmup = warmupFor('strength', true);
    } else if (s.type === 'mobility') {
      s.durationMin = Math.round((s.durationMin || 25) * 0.7);
      s.name = (s.name || 'Lihashuolto') + ' (kevennetty)';
      if (s.exercises && s.exercises.length > 5) {
        s.exercises = s.exercises.slice(0, 5);
      }
      s.details = 'KEVENNETTY – lyhyempi lihashuolto (~' + s.durationMin + ' min).\n' + (s.details || '');
      if (s.warmup) s.warmup = warmupFor('strength', true);
    }
    return s;
  }

  function applyKoventa(session) {
    if (!session) return session;
    const hard = session.subtype === 'tempo' || session.subtype === 'intervals' ||
      session.subtype === 'long' || session.type === 'race';
    if (hard) {
      const s = JSON.parse(JSON.stringify(session));
      s.modified = 'koventa-blocked';
      s.details = (s.details || '') +
        '\n\nHuom: tätä treeniä ei kovenneta – se on jo vaativa. Pidä suunnitelmassa.';
      return s;
    }
    const s = JSON.parse(JSON.stringify(session));
    s.modified = 'koventa';
    if (s.type === 'run' && s.distanceKm) {
      s.distanceKm = round1(s.distanceKm * 1.12);
      s.name = s.name + ' (kovennettu)';
      s.details = 'HIEMAN KOVENNETTU (+12 %)\n' + (s.details || '') +
        `\n→ Matka n. ${s.distanceKm} km. Vauhti silti kontrollissa.`;
    } else if (s.type === 'strength') {
      s.name = s.name + ' (kovennettu)';
      if (s.exercises && s.exercises.length) {
        s.notes = 'HIEMAN KOVENNETTU: +1 sarja pääliikkeisiin TAI +5–10 % kuormaa. ' + (s.notes || '');
        s.details = formatStrengthDetails(s);
      } else {
        s.details = 'HIEMAN KOVENNETTU\n' +
          'Lisää +1 sarja pääliikkeisiin TAI +5–10 % kuormaa.\n' +
          (s.details || '');
      }
    }
    return s;
  }

  function applyShortSwap(session) {
    if (!session) return session;
    const s = JSON.parse(JSON.stringify(session));
    s.modified = 'lyhyt';
    if (s.type === 'run') {
      const km = round1(clamp((s.distanceKm || 8) * 0.4, 3, 6));
      s.distanceKm = km;
      s.name = 'Lyhyt lenkki (20–30 min)';
      s.details =
        `Vuorotyön lyhyt versio: n. ${km} km / 20–30 min.\n` +
        'Helppo vauhti. Parempi lyhyt treeni kuin ei mitään.';
      s.subtype = 'easy-short';
      s.warmup = warmupFor('run', true);
      s.mobility = mobilityFor('run');
    } else if (s.type === 'strength') {
      const short = shortStrength(Object.assign({}, s, {
        name: s.name.replace(' (kevennetty)', '').replace(' (kovennettu)', '').replace(' – lyhyt', '')
      }));
      const out = Object.assign({}, short, {
        type: 'strength',
        subtype: s.subtype,
        location: s.location,
        altId: s.altId,
        durationMin: 25,
        modified: 'lyhyt'
      });
      out.warmup = warmupFor('strength', true);
      out.mobility = mobilityFor('strength');
      return out;
    } else if (s.type === 'mobility') {
      s.durationMin = 15;
      s.name = 'Lihashuolto – lyhyt';
      if (s.exercises && s.exercises.length > 5) s.exercises = s.exercises.slice(0, 5);
      s.details = 'Lyhyt lihashuolto ~15 min – dynaaminen + muutama venytys.';
      if (s.warmup) s.warmup = warmupFor('strength', true);
    } else if (s.type === 'rest') {
      s.details = 'Lepo säilyy – palautuminen on osa suunnitelmaa.';
    }
    return s;
  }

  function swapLocation(session) {
    if (!session || session.type !== 'strength') return session;
    const map = {
      gymA: STRENGTH.homeA, gymB: STRENGTH.homeB,
      homeA: STRENGTH.gymA, homeB: STRENGTH.gymB
    };
    const alt = map[session.subtype] || map[session.altId];
    if (!alt) return session;
    const swapped = {
      type: 'strength',
      subtype: alt.id,
      name: alt.name,
      location: alt.location,
      altId: alt.altId,
      details: alt.details,
      exercises: alt.exercises,
      restNote: alt.restNote,
      notes: alt.notes,
      headline: alt.headline,
      equipmentNote: alt.equipmentNote,
      durationMin: session.durationMin || 60,
      modified: session.modified || 'sijainti'
    };
    // Säilytä kevennetty lämmittely jos oli kevennetty
    const shortened = session.modified === 'keventa' || session.modified === 'lyhyt';
    swapped.warmup = warmupFor('strength', !!shortened);
    swapped.mobility = mobilityFor('strength');
    return swapped;
  }

  /**
   * Ei salikorttia: salitreeni → vastaava kotipiiri (A↔A, B↔B). Valmentajan salipäivä
   * korvataan kotipiirillä, valmentajan muistiinpano säilyy. Muut sessiot ennallaan.
   */
  function noGymSession(session, weekIndex) {
    if (!session || session.type !== 'strength' || session.location !== 'sali') return session;
    const known = session.subtype === 'gymA' || session.subtype === 'gymB' ||
      session.altId === 'homeA' || session.altId === 'homeB';
    let home;
    if (known && !session.coach) {
      home = swapLocation(session);
      if (session.modified === 'keventa' || session.modified === 'lyhyt' || /lyhyt/i.test(session.name || '')) {
        home = Object.assign(shortStrength(home), { warmup: home.warmup, mobility: home.mobility, location: 'koti' });
      }
      home.modified = session.modified || 'ei-salia';
    } else {
      const tmpl = strengthFor(typeof weekIndex === 'number' ? weekIndex : 0, 'koti');
      home = buildStrengthSession(tmpl, session.durationMin || 45);
      home.modified = 'ei-salia';
      if (session.coach) {
        home.coach = Object.assign({}, session.coach, { options: [] });
        home.name = 'Kotipiiri (salitreenin tilalla)';
      }
    }
    home.noGym = true;
    home.details = '🏠 Ei salikorttia → kotiversio' +
      (session.coach ? ' (valmentajan salitreeni: ' + (session.name || '') + ')' : '') + '.\n' + (home.details || '');
    return home;
  }

  /**
   * Vaihda päivän treenityyppi yhdellä napilla.
   * kind: 'koti' | 'sali' | 'juoksu' | 'lihashuolto' | 'kavely' | 'pyoraily' | 'uinti' | 'salibandy' | 'muu'
   * ctx: { weekIndex, phaseId|phase, fitness, currentSession, deload }
   */
  function buildStrengthSession(tmpl, durationMin) {
    const s = {
      type: 'strength',
      subtype: tmpl.id,
      name: tmpl.name,
      location: tmpl.location,
      altId: tmpl.altId,
      details: tmpl.details,
      exercises: (tmpl.exercises || []).map(function (ex) { return Object.assign({}, ex); }),
      restNote: tmpl.restNote,
      notes: tmpl.notes,
      headline: tmpl.headline,
      equipmentNote: tmpl.equipmentNote,
      durationMin: durationMin || 60,
      modified: 'tyyppi'
    };
    attachPrep(s);
    return s;
  }

  function buildEasyRunSession(fitness, deload, phaseId) {
    const weekly = (fitness && fitness.weekly) || 19;
    const longest = (fitness && fitness.longest) || 14;
    const vol = weeklyVolumeTarget(weekly, 0, 40, !!deload);
    const longKm = longRunKm(longest, 0, 40, !!deload);
    let km = easyRunKm(vol, longKm, !!deload);
    // Vaihekohtainen säätö: taper lyhyempi, peak hieman pidempi helppo
    if (phaseId === 'taper') km = round1(clamp(km * 0.75, 4, 8));
    else if (phaseId === 'peak') km = round1(clamp(km, 5, 12));
    else if (phaseId === 'build') km = round1(clamp(km, 5, 14));
    else km = round1(clamp(km, 4, 12));
    const s = {
      type: 'run',
      subtype: 'easy',
      name: 'Helppo lenkki',
      distanceKm: km,
      cueIds: ['easy_run_form'],
      details:
        'Helppo vauhti n. ' + km + ' km.\n' +
        EASY_HR_TEXT + '\n' +
        'Hengitys rauhallinen, voit jutella koko matkan.\n' +
        'Vaihdettu päivän treeniksi – pidä kevyenä.',
      modified: 'tyyppi'
    };
    attachPrep(s);
    return s;
  }

  function buildLihashuoltoSession() {
    // ~20–30 min: dynaaminen lämmittely + venyttelyt liikkuvuus-kirjastosta
    const warmup = warmupFor('strength', false);
    warmup.label = 'Dynaaminen lämmittely';
    warmup.durationMin = 8;
    warmup.note = '5–10 min kevyt liike ennen venyttelyitä.';
    const exercises = [
      { id: 'cat_cow', label: 'Kissa–lehmä', sets: '8–12' },
      { id: 'thoracic_opener', label: 'Rintarangan avaukset', sets: '6/puoli' },
      { id: 'hip_opener', label: 'Lonkan avaukset', sets: '6–8/puoli' },
      { id: 'worlds_greatest_stretch', label: "World's greatest stretch", sets: '3–4/puoli' },
      { id: 'hip_flexor_stretch', label: 'Lonkan koukistajan venytys', sets: '30–40 s/puoli' },
      { id: 'hamstring_stretch', label: 'Takareiden venytys', sets: '30 s/puoli' },
      { id: 'figure4_stretch', label: 'Figure-4 / pakara', sets: '30–40 s/puoli' },
      { id: 'calf_stretch', label: 'Pohjevenytys', sets: '30 s/puoli' },
      { id: 'childs_pose', label: 'Lapsen asento', sets: '45–60 s' }
    ];
    const s = {
      type: 'mobility',
      subtype: 'lihashuolto',
      name: 'Lihashuolto',
      durationMin: 25,
      details:
        'Palauttava liikkuvuus ~20–30 min.\n' +
        'Ei raskasta treeniä – dynaaminen lämmittely + venyttelyt.\n' +
        'Hengitä rauhallisesti, älä pakota ääriasentoihin.',
      headline: 'Lihashuolto / palautus (~25 min)',
      exercises: exercises,
      notes: 'Käytä liikkuvuus-kirjaston liikkeitä. Kipua ei saa tuntua.',
      modified: 'tyyppi',
      warmup: warmup,
      mobility: null
    };
    return s;
  }

  function swapSessionType(kind, ctx) {
    ctx = ctx || {};
    const weekIndex = typeof ctx.weekIndex === 'number' ? ctx.weekIndex : 0;
    const phaseId = ctx.phaseId || (ctx.phase && ctx.phase.id) || ctx.phase || 'base';
    const fitness = ctx.fitness || { weekly: 19, longest: 14 };
    const current = ctx.currentSession || null;
    const deload = !!ctx.deload;

    if (kind === 'koti') {
      const tmpl = strengthFor(weekIndex, 'koti');
      return buildStrengthSession(tmpl, 60);
    }
    if (kind === 'sali') {
      const tmpl = strengthFor(weekIndex, 'sali');
      return buildStrengthSession(tmpl, 60);
    }
    if (kind === 'juoksu') {
      // Jos päivä on jo laatujuoksu / pitkä, pidä se (tuore prep); muuten helppo vaiheeseen sopiva
      if (current && current.type === 'run') {
        const quality = current.subtype === 'tempo' || current.subtype === 'intervals' ||
          current.subtype === 'strides' || current.subtype === 'long';
        if (quality) {
          const kept = JSON.parse(JSON.stringify(current));
          kept.modified = 'tyyppi';
          delete kept.painSoftened;
          delete kept.preferCrossTrain;
          attachPrep(kept);
          return kept;
        }
        if (current.subtype === 'easy' || current.subtype === 'easy-short') {
          const kept = JSON.parse(JSON.stringify(current));
          kept.modified = kept.modified || 'tyyppi';
          kept.subtype = 'easy';
          if (!kept.name || /kevennetty|lyhyt|salibandy/i.test(kept.name)) {
            kept.name = 'Helppo lenkki';
          }
          attachPrep(kept);
          return kept;
        }
      }
      // Laatupäivän vaihtoehto: jos vaihe build/peak ja ei nykyistä juoksua, silti helppo oletuksena
      return buildEasyRunSession(fitness, deload, phaseId);
    }
    if (kind === 'lihashuolto') {
      return buildLihashuoltoSession();
    }
    if (kind === 'hiihto') {
      return buildSkiSession(current, ctx);
    }
    if (kind === 'kavely' || kind === 'pyoraily' || kind === 'uinti' ||
        kind === 'salibandy' || kind === 'muu') {
      return buildOtherActivitySession(kind, ctx);
    }
    return current;
  }


  const OTHER_ACTIVITY_KINDS = {
    kavely: {
      name: 'Kävely',
      emoji: '🚶',
      durationMin: 40,
      lightLoad: true,
      details:
        'Kävely – kevyt aktiivisuus.\n' +
        'Ei lasketa kovaksi juoksuksi. Sopii palautukseen, vuoron jälkeen tai kevyeksi päiväksi.\n' +
        'Pidä vauhti rauhallisena; voit jutella koko ajan.'
    },
    pyoraily: {
      name: 'Pyöräily',
      emoji: '🚴',
      durationMin: 45,
      lightLoad: true,
      details:
        'Pyöräily – kevyt / ristiinharjoittelu.\n' +
        'Hyvä vaihtoehto kun juoksu tuntuu raskaalta tai kipu aristaa.\n' +
        'Pidä teho maltillisena (voit jutella).'
    },
    uinti: {
      name: 'Uinti',
      emoji: '🏊',
      durationMin: 40,
      lightLoad: true,
      details:
        'Uinti – kevyt aktiivisuus / ristiin.\n' +
        'Vähäinen isku, hyvä palautukseen. Älä vedä allasvetoja kovalla teholla jos väsynyt.'
    },
    hiihto: {
      name: 'Hiihto',
      emoji: '⛷️',
      durationMin: 45,
      lightLoad: true,
      details:
        'Hiihto (perinteinen tai luistelu) – helpon lenkin korvaaja.\n' +
        'Syke 115–138: väsyneenä alapäässä, kello hälyttää vasta yli 138.\n' +
        'Hiihtokilometrit lasketaan erikseen, ei juoksukilometreihin.'
    },
    salibandy: {
      name: 'Salibandy',
      emoji: '🏒',
      durationMin: 60,
      lightLoad: false,
      hardLoad: true,
      details:
        '🏒 Salibandy – kova kuormituspäivä (TE jopa 5.0).\n' +
        'Riittää viikon kovaksi ärsykkeeksi. Älä lisää laatujuoksua samaan päivään / seuraavaan aamuun.\n' +
        'Merkitse Valmis kun olet pelannut.'
    },
    muu: {
      name: 'Muu liikunta',
      emoji: '✨',
      durationMin: 30,
      lightLoad: true,
      details:
        'Muu liikunta – merkitty aktiivisuudeksi.\n' +
        'Lasketaan kevyeksi viikkoaktiivisuudeksi (ei kovana juoksuna).'
    }
  };

  /**
   * Kävely / pyöräily / uinti / salibandy / muu.
   * lightLoad: ei lasketa kovaksi juoksuksi; viikkoaktiivisuuteen kevyesti.
   */
  function buildOtherActivitySession(kind, opts) {
    opts = opts || {};
    const base = OTHER_ACTIVITY_KINDS[kind] || OTHER_ACTIVITY_KINDS.muu;
    const customName = (opts.customName || '').trim();
    const name = kind === 'muu' && customName ? customName : base.name;
    const s = {
      type: 'other',
      subtype: kind === 'muu' ? 'muu' : kind,
      name: name,
      durationMin: opts.durationMin || base.durationMin,
      details: base.details + (kind === 'muu' && customName ? '\nNimi: ' + customName : ''),
      lightLoad: !!base.lightLoad,
      hardLoad: !!base.hardLoad,
      modified: 'tyyppi',
      activityKind: kind
    };
    if (kind === 'salibandy') {
      s.salibandyDay = true;
      s.modified = 'salibandy';
    }
    if (s.lightLoad) {
      s.mobility = mobilityFor('gentle');
    }
    return s;
  }

  /**
   * Hiihto helpon/palauttavan/pitkän lenkin tilalle: sama kesto (min), sama sykeikkuna 115–138.
   * Kesto = juoksun durationMin tai km × ~6:45/km, pyöristys 5 min; muuten 45 min.
   */
  function buildSkiSession(current, ctx) {
    const s = buildOtherActivitySession('hiihto', ctx);
    if ((!current || current.type !== 'run') && ctx && ctx.plannedSession && ctx.plannedSession.type === 'run') {
      current = ctx.plannedSession;
    }
    let min = null;
    let fromRun = null;
    if (current && current.type === 'run') {
      fromRun = current.name || 'Juoksu';
      if (typeof current.durationMin === 'number' && current.durationMin > 0) min = current.durationMin;
      else if (current.distanceKm) min = current.distanceKm * 6.75;
    }
    if (min) min = Math.max(20, Math.round(min / 5) * 5);
    s.durationMin = min || OTHER_ACTIVITY_KINDS.hiihto.durationMin;
    s.hrTarget = EASY_HR.slice();
    s.replacesRunKm = current && current.type === 'run' && current.distanceKm ? current.distanceKm : null;
    s.details =
      'Hiihto ~' + s.durationMin + ' min' + (fromRun ? ' (korvaa: ' + fromRun + (s.replacesRunKm ? ' ' + s.replacesRunKm + ' km' : '') + ', sama kesto)' : '') + '.\n' +
      'Syke 115–138: väsyneenä ja palauttavana alapäässä, pitkällä yläpää ok – kello hälyttää vasta yli 138.\n' +
      'Tasainen, rento tekeminen; ylämäet rauhassa, ettei syke karkaa.\n' +
      'Hiihtokilometrit lasketaan erikseen, ei juoksukilometreihin.';
    return s;
  }

  function applySick(session) {
    return {
      type: 'rest',
      subtype: 'sick',
      name: 'Sairas – lepo',
      details:
        'Sairaus: treeni peruttu.\n' +
        'Lepää, juo nesteitä, kuuntele kehoa.\n' +
        'Älä korvaa treeniä automaattisesti huomenna – palaa kevyesti kun voit hyvin.\n' +
        'Jos olo sallii: vapaaehtoinen kevyt liikkuvuus alla (ei treeniä).',
      modified: 'sairas',
      originalType: session && session.type,
      mobility: mobilityFor('gentle')
    };
  }

  function applyNoMood(session) {
    if (!session || session.type === 'rest') return session;
    // Tarjoa helpompi: lyhyt TAI lepo
    const short = applyShortSwap(session);
    short.modified = 'ei-fiilista';
    short.name = 'Keveämpi vaihtoehto';
    short.details =
      'Ei fiilistä tänään – se on ok.\n\n' +
      short.details +
      '\n\nVaihtoehto: merkitse lepopäiväksi jos tarvitset palautusta.';
    return short;
  }

  /**
   * 4 viikon ehdotus (suomeksi) – polarisoitu, salibandy = kova päivä.
   * Alkaa "tänään"-viikosta.
   */
  function fourWeekSuggestion(fitness, settings) {
    const baseW = (fitness && fitness.weekly) || 19;
    const baseL = (fitness && fitness.longest) || 14;
    const longs = [
      round1(clamp(Math.min(baseL * 0.85, 14), 12, 14)),
      round1(clamp(Math.min(baseL * 0.9, 15), 13, 15)),
      round1(clamp(Math.min(baseL, 16), 14, 16)),
      round1(clamp(Math.min(baseL * 0.85, 14), 12, 15)) // kevennys
    ];
    const vols = [
      round1(clamp(baseW, 18, 22)),
      round1(clamp(baseW * 1.05, 19, 24)),
      round1(clamp(baseW * 1.08, 20, 25)),
      round1(clamp(baseW * 0.85, 16, 20)) // deload / kevennys
    ];
    const saliLabel = (function () {
      const d = settings && settings.salibandyDow;
      if (d === null || d === undefined || d === '' || d === 'none') return 'valitse ilta (esim. pe)';
      return DOW_FULL[+d] || 'pe';
    })();

    const weeks = [];
    for (let i = 0; i < 4; i++) {
      weeks.push({
        week: i + 1,
        volumeKm: vols[i],
        longKm: longs[i],
        deload: i === 3,
        summary:
          (i === 3 ? 'Kevennysviikko. ' : '') +
          `~${vols[i]} km: 2–3 helppoa, pitkä ~${longs[i]} km, 1 laatu (tempo/kynnys) ei salibandy-päivänä, 1–2 voimaa. ` +
          'Suurin osa helpolla.'
      });
    }

    const textFi =
      '4 viikon ehdotus (polarisoitu, lähtötaso ~' + baseW + ' km/vk)\n\n' +
      'Viikkokaava:\n' +
      '• 2–3 helppoa lenkkiä (suurin osa kilometreistä)\n' +
      '• 1 pitkä: vk1 ~' + longs[0] + ' → vk3–4 kohti ' + longs[2] + '–' + longs[3] + ' km (~10 % sääntö)\n' +
      '• 1 laatutreeni (tempo/kynnys) – EI salibandy-iltana eikä seuraavana aamuna\n' +
      '• 1–2 voimatreeniä (leuanveto 3×3–5 / scap+band; punnerrus 3×10–15; sali RPE 6–7)\n' +
      '• 1 salibandy = kova päivä (TE), jätä tilaa sille\n\n' +
      'Salibandy-ilta asetuksissa: ' + saliLabel + '\n\n' +
      weeks.map(function (w) {
        return 'Vk ' + w.week + (w.deload ? ' (kevennys)' : '') +
          ': ~' + w.volumeKm + ' km, pitkä ~' + w.longKm + ' km';
      }).join('\n');

    return { weeks: weeks, textFi: textFi, salibandyLabel: saliLabel };
  }

  /** Merkitse päivä salibandyksi / kovaksi kuormaksi – kevennä tarvittaessa */
  function applySalibandy(session) {
    if (!session) return session;
    const s = JSON.parse(JSON.stringify(session));
    s.modified = 'salibandy';
    s.salibandyDay = true;
    if (s.type === 'run' && (s.subtype === 'tempo' || s.subtype === 'intervals' || s.subtype === 'strides')) {
      s.subtype = 'easy';
      s.name = 'Helppo (salibandy)';
      s.distanceKm = round1(clamp((s.distanceKm || 8) * 0.5, 3, 6));
      s.details =
        '🏒 Salibandy / kova kuorma merkitty.\n' +
        'Laatutreeni jätetty väliin – salibandy riittää kovaksi ärsykkeeksi.\n' +
        'Jos juokset, max ~' + s.distanceKm + ' km hyvin kevyesti.';
      s.warmup = warmupFor('run', true);
      s.mobility = mobilityFor('run');
    } else if (s.type === 'run') {
      s.name = (s.name || 'Juoksu') + ' (salibandy-päivä)';
      if (s.distanceKm) s.distanceKm = round1(s.distanceKm * 0.7);
      s.details =
        '🏒 Salibandy / kova kuorma.\n' +
        'Lyhennä juoksua tai jätä väliin jos peli oli raskas.\n' +
        (s.details || '');
    } else if (s.type === 'strength') {
      const short = shortStrength(s);
      Object.assign(s, short);
      s.type = 'strength';
      s.modified = 'salibandy';
      s.name = 'Voima lyhyt (salibandy-päivä)';
      s.details =
        '🏒 Salibandy merkitty – pidä voima lyhyenä tai siirrä.\n' + (s.details || '');
      s.warmup = warmupFor('strength', true);
      s.mobility = mobilityFor('strength');
    } else if (s.type === 'rest') {
      s.name = 'Salibandy / lepo';
      s.subtype = 'salibandy';
      s.details =
        '🏒 Salibandy-ilta. Merkitse tehdyksi kun olet pelannut.\n' +
        'Lasketaan viikon kovaksi treeniksi (TE jopa 5.0). Älä lisää laatujuoksua huomiseksi aamuksi.';
      s.mobility = mobilityFor('gentle');
    }
    return s;
  }


  const TIP_DISCLAIMER =
    'Tämä on treenivinkki, ei lääketieteellinen diagnoosi tai hoito. Jos kipu pahenee, turvota tai on yö-/lepo kipua, hakeudu ammattilaisen arvioon.';

  const KNEE_HELP_EXERCISE_IDS = [
    'glute_activation', 'single_leg_hip_thrust', 'quad_stretch',
    'figure4_stretch', 'hip_flexor_stretch', 'calf_raise', 'dead_bug', 'hip_opener'
  ];

  /** Conservative condition tip cards + detect/soften rules (training tips, not diagnosis). */
  const CONDITIONS = {
    runners_knee: {
      id: 'runners_knee',
      label: 'Juoksijan polvi',
      promptTitle: 'Miten polvi tänään?',
      promptHint: 'Valinta säätää iskun määrää (juoksu/voima).',
      tipTitle: 'Juoksijan polvi – vinkit',
      tipClass: 'knee-tip',
      exerciseIds: KNEE_HELP_EXERCISE_IDS.slice(),
      bullets: [
        'Kuormanhallinta: älä nosta volyymia ja alamäkiä samaan aikaan.',
        'Vahvista etureisiä ja pakaroita (kontrolli > maksimivoima).',
        'Vältä äkillisiä alamäkipiikkejä ja hyppyjä kuormituksen noustessa.',
        'Jää / suhteellinen lepo ärsytyksen jälkeen; palaa kivuttomaan juoksuun asteittain.',
        'Lyhyt askel, pehmeä alusta ja pyörä/elliptical ovat hyviä kevennyksiä.',
        TIP_DISCLAIMER
      ]
    },
    it_band: {
      id: 'it_band',
      label: 'IT-jänne / lateraalinen lonkka–polvi',
      promptTitle: 'Miten IT-jänne / lonkka–polvi tänään?',
      promptHint: 'Valinta säätää juoksun iskuja ja alamäkikuormaa.',
      tipTitle: 'IT-jänne – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'glute_med_side_lie', 'glute_activation', 'single_leg_hip_thrust',
        'figure4_stretch', 'hip_opener', 'quad_stretch', 'calf_stretch'
      ],
      bullets: [
        'Kuormanhallinta: vältä äkillisiä alamäki- ja volyymipiikkejä.',
        'Vahvista keskipakaralihasta ja lonkan hallintaa (glute med).',
        'Pehmeämpi alusta ja lyhyempi askel voivat helpottaa ärsytystä.',
        'Foam roll / venyttely voi tuntua hyvältä, mutta voima + kuormanhallinta ovat tärkeämpiä.',
        'Jos aristus pahenee juostessa, vaihda osan pyöräksi / ellipticaliksi.',
        TIP_DISCLAIMER
      ]
    },
    rotator_cuff: {
      id: 'rotator_cuff',
      label: 'Kiertäjäkalvo / olkapää',
      promptTitle: 'Miten olkapää tänään?',
      promptHint: 'Valinta säätää punnerruksia ja ylävartalon kuormaa.',
      tipTitle: 'Kiertäjäkalvo / olkapää – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'codman_pendulum', 'wall_walk', 'stick_external_rotation', 'iso_external_rotation',
        'band_external_rotation', 'scap_squeeze', 'cross_body_stretch'
      ],
      bullets: [
        'Kuormanhallinta: vältä raskaita pystypunnerruksia ja kivuliaita yläasentoja.',
        'Suosi hallittua ulkokiertoa ja lapaluun tukea (kevyt nauha).',
        'Pidä liike kivuttomalla alueella – kipu ≠ edistyminen.',
        'Juoksu yleensä ok jos olkapää ei ärsyynny käsien heilunnasta.',
        'Palaa punnerruksiin asteittain, kun päivittäiset liikkeet ovat kivuttomia.',
        TIP_DISCLAIMER
      ]
    },
    achilles: {
      id: 'achilles',
      label: 'Akilles / tendinopatia',
      promptTitle: 'Miten akilles tänään?',
      promptHint: 'Valinta säätää juoksun iskuja ja nopeustyötä.',
      tipTitle: 'Akilles – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'calf_raise_eccentric', 'calf_raise', 'calf_stretch',
        'ankle_mobility', 'towel_stretch_foot', 'hip_opener'
      ],
      bullets: [
        'Kuormanhallinta: vältä äkillisiä sprintti-, hyppy- ja mäkipiikkejä.',
        'Eksentrinen / hidastempoinen pohjetyö on usein hyödyllinen treenivinkki – etene maltilla.',
        'Pidä päivittäinen kävely/juoksu kivun rajoissa (ärsytyksen jälkeinen kipu ei saisi nousta pitkäksi).',
        'Suosi tasaista alustaa; vaihda tarvittaessa pyörään.',
        'Älä venytä aggressiivisesti kipeää jännettä “poikki”.',
        TIP_DISCLAIMER
      ]
    },
    plantar_fasciitis: {
      id: 'plantar_fasciitis',
      label: 'Plantaarifaskiitti',
      promptTitle: 'Miten jalkapohja / kantapää tänään?',
      promptHint: 'Valinta säätää juoksun volyymia ja iskuja.',
      tipTitle: 'Plantaarifaskiitti – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'towel_stretch_foot', 'calf_stretch', 'calf_raise',
        'ankle_mobility', 'hip_opener', 'glute_activation'
      ],
      bullets: [
        'Kuormanhallinta: älä nosta juoksukilometrejä ja kovaa alustaa samaan aikaan.',
        'Aamuinen pyyhevenytys + pohjevenytys voivat helpottaa tuntumaa.',
        'Tukevat kengät / pehmeämpi alusta; vältä paljasjalkapiikkejä ärsytyksen aikana.',
        'Lyhennä lenkkiä tai vaihda pyörään jos aristus pahenee.',
        'Voima (pohje, lonkka) + asteittainen paluu > pelkkä lepo ikuisesti.',
        TIP_DISCLAIMER
      ]
    },
    low_back: {
      id: 'low_back',
      label: 'Alaselkä',
      promptTitle: 'Miten alaselkä tänään?',
      promptHint: 'Valinta säätää nostoja ja juoksun kovaa työtä.',
      tipTitle: 'Alaselkä – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'dead_bug', 'cat_cow', 'glute_activation', 'plank',
        'hip_flexor_stretch', 'childs_pose', 'hamstring_stretch'
      ],
      bullets: [
        'Kuormanhallinta: vältä raskaita vetoliikkeitä ja syviä kyykkyjä kivun rajoissa.',
        'Suosi hallittua keskivartaloa (dead bug) ja pehmeää liikkuvuutta (kissa–lehmä).',
        'Juoksu: pidä vauhti helppona; vältä pitkiä alamäkiä jos aristus lisääntyy.',
        'Nouse välillä kävelemään – pitkä staattinen istuminen voi jäykistää.',
        'Terävä säteily, puutuminen tai yö kipu → ammattilaisen arvio.',
        TIP_DISCLAIMER
      ]
    },
    ankle_sprain_acute: {
      id: 'ankle_sprain_acute',
      label: 'Nilkan nyrjähdys (akuutti)',
      promptTitle: 'Miten nilkka tänään?',
      promptHint: 'Akuutti nyrjähdys: suosi suhteellista lepoa, ei aggressiivista kuormitusta.',
      tipTitle: 'Nilkan nyrjähdys (akuutti) – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'ankle_mobility', 'calf_stretch', 'towel_stretch_foot', 'childs_pose'
      ],
      bullets: [
        'Suhteellinen lepo: vältä juoksua, hyppyjä ja suunnanmuutoksia kunnes kävely on kivutonta.',
        'Suosi pyörää / yläkroppaa / kevyttä liikkuvuutta – ei aggressiivista “testaamista”.',
        'Turvotus, mustelma tai varauksen pelko → anna paranemisaikaa; tarvittaessa ammattilainen.',
        'Kun kävely on ok, palaa asteittain: kävely → hölkkä → helppo juoksu.',
        'Älä aloita eksentrisiä hyppyjä tai salibandyä liian aikaisin.',
        TIP_DISCLAIMER
      ]
    },
    ankle_sprain_history: {
      id: 'ankle_sprain_history',
      label: 'Nilkan nyrjähdys (historia)',
      promptTitle: null, // no daily prompt for history-only
      promptHint: null,
      tipTitle: 'Nilkan nyrjähdys (historia) – vinkit',
      tipClass: 'condition-tip',
      exerciseIds: [
        'ankle_mobility', 'calf_raise', 'single_leg_hip_thrust',
        'glute_med_side_lie', 'hip_opener', 'calf_stretch'
      ],
      bullets: [
        'Historia: panosta proprioseptiikkaan ja yhden jalan hallintaan ennen kovaa suunnanmuutosta.',
        'Lämmittelyyn nilkan liikkuvuus + kevyt pohjetyö.',
        'Älä hyppää suoraan aggressiiviseen plyometriaan – etene hallitusti.',
        'Epävarmalla alustalla / väsyneenä riski uusiutua: pidä fokus tekniikassa.',
        TIP_DISCLAIMER
      ]
    }
  };

  function painBlob(p) {
    return ((p.area || '') + ' ' + (p.condition || '') + ' ' + (p.notes || '')).toLowerCase();
  }

  function inferConditionId(p) {
    if (!p) return null;
    const blob = painBlob(p);
    const area = (p.area || '').toLowerCase();
    const status = p.status || 'active';

    if (/plantaari|plantar|fasciitti|fasciitis/.test(blob) ||
        (/kantapää|jalkapohja/.test(blob) && /kipu|faski|fasci/.test(blob))) {
      return 'plantar_fasciitis';
    }
    if (/akilles|achilles|tendinopat/.test(blob) || area === 'akilles') {
      return 'achilles';
    }
    if (area === 'nilkka' || /nyrjähdys|nyrja|sprain|nyrjäht/.test(blob)) {
      return status === 'history' ? 'ankle_sprain_history' : 'ankle_sprain_acute';
    }
    if (/kiertäjäkalvo|kiertajakalvo|rotator|cuff/.test(blob) || area === 'olkapää') {
      return 'rotator_cuff';
    }
    if (/alaselkä|alaselka|low.?back|lumbago|lanneranka/.test(blob) ||
        (area === 'selkä' && !/yläselkä|niska|kaula/.test(blob))) {
      return 'low_back';
    }
    if (/it[- ]?jänne|it[- ]?janne|iliotibia|it.?band|juoksijan.?lonkka|lateraalinen/.test(blob)) {
      return 'it_band';
    }
    if (/juoksijan.?polvi|runners?.?knee|pfps|patellofemor/.test(blob)) {
      return 'runners_knee';
    }
    if (area === 'polvi') return 'runners_knee';
    if (area === 'lonkka') return 'it_band';
    if (area === 'pohje' && /akilles|jänne/.test(blob)) return 'achilles';
    if (p.condition && CONDITIONS[normalizeConditionKey(p.condition)]) {
      return normalizeConditionKey(p.condition);
    }
    return null;
  }

  function normalizeConditionKey(label) {
    const s = String(label || '').toLowerCase();
    if (/juoksijan.?polvi|runners/.test(s)) return 'runners_knee';
    if (/it|lateraal|iliotibia|juoksijan.?lonkka/.test(s)) return 'it_band';
    if (/kiertäjä|rotator|olkapää/.test(s)) return 'rotator_cuff';
    if (/akilles|achilles/.test(s)) return 'achilles';
    if (/plantaari|plantar/.test(s)) return 'plantar_fasciitis';
    if (/alaselkä|selkä|low.?back/.test(s)) return 'low_back';
    if (/nilkka|nyrjähdys|sprain/.test(s)) {
      return /historia|history/.test(s) ? 'ankle_sprain_history' : 'ankle_sprain_acute';
    }
    return null;
  }

  function detectConditionLabel(area, notes, status) {
    const id = inferConditionId({ area: area || '', notes: notes || '', condition: '', status: status || 'active' });
    return id && CONDITIONS[id] ? CONDITIONS[id].label : '';
  }

  function getActivePains(pains) {
    return (pains || []).filter(function (p) { return p.status === 'active'; });
  }

  function matchedConditions(pains, opts) {
    opts = opts || {};
    const includeHistory = !!opts.includeHistory;
    const seen = {};
    const out = [];
    (pains || []).forEach(function (p) {
      if (!includeHistory && p.status !== 'active') return;
      // History ankle: include even when status is history
      if (p.status === 'history' && includeHistory) {
        const id = inferConditionId(p);
        if (id && !seen[id]) {
          seen[id] = true;
          out.push(CONDITIONS[id]);
        }
        return;
      }
      if (p.status !== 'active') return;
      const id = inferConditionId(p);
      if (id && CONDITIONS[id] && !seen[id]) {
        seen[id] = true;
        out.push(CONDITIONS[id]);
      }
    });
    return out;
  }

  function hasActiveKneePain(pains) {
    return matchedConditions(pains).some(function (c) { return c.id === 'runners_knee'; });
  }

  function hasActiveCondition(pains, id) {
    return matchedConditions(pains).some(function (c) { return c.id === id; });
  }

  function conditionsForTips(pains) {
    // Active conditions + history ankle sprain tips
    const active = matchedConditions(pains);
    const seen = {};
    active.forEach(function (c) { seen[c.id] = true; });
    const out = active.slice();
    (pains || []).forEach(function (p) {
      if (p.status !== 'history') return;
      const id = inferConditionId(Object.assign({}, p, { status: 'history' }));
      if (id === 'ankle_sprain_history' && !seen[id] && CONDITIONS[id]) {
        seen[id] = true;
        out.push(CONDITIONS[id]);
      }
    });
    return out;
  }

  function tipCardHtml(conditionId) {
    const c = CONDITIONS[conditionId];
    if (!c) return null;
    return {
      id: c.id,
      title: c.tipTitle,
      tipClass: c.tipClass || 'condition-tip',
      bullets: c.bullets.slice(),
      exerciseIds: c.exerciseIds.slice()
    };
  }

  function kneeTipCardHtml() {
    return tipCardHtml('runners_knee');
  }

  function allTipCards(pains) {
    return conditionsForTips(pains).map(function (c) { return tipCardHtml(c.id); }).filter(Boolean);
  }

  function conditionsNeedingPrompt(pains) {
    return matchedConditions(pains).filter(function (c) { return c.promptTitle; });
  }

  /**
   * Normalize today's answers.
   * Legacy: kneeAnswer string 'ok'|'aristaa'|'kipea'
   * New: map { conditionId: answer } or health.conditionCheck[iso]
   */
  function normalizeAnswers(answers, pains) {
    if (answers == null) return {};
    if (typeof answers === 'string') {
      const map = {};
      if (hasActiveKneePain(pains) || answers) map.runners_knee = answers;
      return map;
    }
    return answers || {};
  }

  function worstAnswer(map) {
    const vals = Object.keys(map || {}).map(function (k) { return map[k]; });
    if (vals.indexOf('kipea') >= 0) return 'kipea';
    if (vals.indexOf('aristaa') >= 0) return 'aristaa';
    if (vals.length && vals.every(function (v) { return v === 'ok'; })) return 'ok';
    return null;
  }

  /**
   * Soften session when active pain conditions or today's checks say aristaa/kipeä.
   * answers: 'ok'|'aristaa'|'kipea' (legacy knee) | { conditionId: answer }
   */
  function applyPainSoftening(session, pains, answers) {
    if (!session) return session;
    const ansMap = normalizeAnswers(answers, pains);
    const activeConds = matchedConditions(pains);

    // If user said OK for all prompted conditions that are active, skip
    if (activeConds.length) {
      const prompted = activeConds.filter(function (c) { return c.promptTitle; });
      if (prompted.length && prompted.every(function (c) { return ansMap[c.id] === 'ok'; })) {
        return session;
      }
    }

    // Legacy: single 'ok' with only knee
    if (answers === 'ok') return session;

    const needsSoft = activeConds.some(function (c) {
      const a = ansMap[c.id];
      if (a === 'ok') return false;
      if (a === 'aristaa' || a === 'kipea') return true;
      // no answer yet → soften for active (conservative), except history-only tips
      return c.id !== 'ankle_sprain_history';
    });
    // Also soften if legacy knee answer without map
    if (!needsSoft && !(answers === 'aristaa' || answers === 'kipea')) return session;
    if (!activeConds.length && !(answers === 'aristaa' || answers === 'kipea')) return session;

    const s = JSON.parse(JSON.stringify(session));
    const ids = activeConds.map(function (c) { return c.id; });
    if (!ids.length && (answers === 'aristaa' || answers === 'kipea')) ids.push('runners_knee');

    const severe = activeConds.some(function (c) {
      const a = ansMap[c.id];
      if (a === 'kipea') return true;
      return (pains || []).some(function (p) {
        if (p.status !== 'active') return false;
        if (inferConditionId(p) !== c.id) return false;
        return p.severity === 'mod' || p.severity === 'kova';
      });
    }) || answers === 'kipea' || ids.indexOf('ankle_sprain_acute') >= 0;

    const hasKnee = ids.indexOf('runners_knee') >= 0 || ids.indexOf('it_band') >= 0;
    const hasAchilles = ids.indexOf('achilles') >= 0 || ids.indexOf('plantar_fasciitis') >= 0;
    const hasAnkleAcute = ids.indexOf('ankle_sprain_acute') >= 0;
    const hasShoulder = ids.indexOf('rotator_cuff') >= 0;
    const hasBack = ids.indexOf('low_back') >= 0;

    if (s.type === 'run') {
      s.painSoftened = true;
      s.modified = (s.modified ? s.modified + '+' : '') + 'kipu';
      if (hasAnkleAcute || (severe && (hasKnee || hasAchilles))) {
        s.name = (s.name || 'Juoksu') + ' → pyörä/krossi (kipu)';
        s.preferCrossTrain = true;
        s.details =
          (hasAnkleAcute
            ? 'NILKKA (AKUUTTI NYRJÄHDYS) – suhteellinen lepo\nSuosi pyörää / yläkroppaa. Ei juoksua, hyppyjä tai suunnanmuutoksia.\n'
            : 'KIPU ARISTAA PALJON\nSuosi tänään pyörää, crosstraineria tai reipasta kävelyä.\n') +
          'Vältä alamäkijuoksua, hyppyjä ja äkillisiä suunnanmuutoksia.\n' +
          (s.details || '');
        if (s.distanceKm) s.distanceKm = round1(s.distanceKm * (hasAnkleAcute ? 0.4 : 0.55));
        if (s.subtype === 'tempo' || s.subtype === 'intervals' || s.subtype === 'strides') {
          s.subtype = 'easy';
        }
      } else {
        const tag = hasAchilles ? 'akilles/pohja' : hasKnee ? 'polvi/IT' : hasBack ? 'selkä' : 'kipu';
        s.name = (s.name || 'Juoksu') + ' (' + tag + ' huomioitu)';
        s.details =
          'KIPU HUOMIOITU – kevennetty isku\n' +
          'Pidä vauhti helppona, vältä alamäkiä ja nopeuspiikkejä, lyhennä tarvittaessa.\n' +
          'Voit vaihtaa osan pyöräksi / ellipticaliksi.\n' +
          (s.details || '');
        if (s.distanceKm) s.distanceKm = round1(s.distanceKm * 0.8);
        if (s.subtype === 'tempo' || s.subtype === 'intervals') {
          s.subtype = 'easy';
          s.name = 'Helppo (' + tag + ' huomioitu)';
        }
      }
      s.warmup = warmupFor('run', true);
    } else if (s.type === 'strength') {
      s.painSoftened = true;
      s.modified = (s.modified ? s.modified + '+' : '') + 'kipu';
      if (s.exercises && s.exercises.length) {
        s.exercises = s.exercises.map(function (ex) {
          const id = ((ex.id || '') + ' ' + (ex.label || '')).toLowerCase();
          let next = ex;
          if (hasKnee || hasAnkleAcute) {
            if (/lunge|squat|jump|box|askel|kyykky/.test(id)) {
              next = Object.assign({}, next, {
                sets: severe || hasAnkleAcute ? '2×6–8 kevyt / tai jätä väliin' : '2–3×8 hallittu, kivuton ROM',
                alt: next.alt || 'lonkkasilta / glute bridge',
                painNote: hasAnkleAcute ? 'Nilkka: vältä hyppyjä ja epävakaata alustaa' : 'Polvi/IT: pidä liike kivuttomana'
              });
            }
          }
          if (hasAchilles) {
            if (/jump|box|calf|pohje|hop/.test(id)) {
              next = Object.assign({}, next, {
                sets: '2×8–10 hallittu / tai jätä väliin',
                painNote: 'Akilles/pohja: ei plyometriaa ärsytyksen aikana'
              });
            }
          }
          if (hasShoulder) {
            if (/press|punnerr|overhead|pysty|bench|olkapää|military|dip/.test(id)) {
              next = Object.assign({}, next, {
                sets: severe ? 'kevyt / tai jätä väliin' : '2–3×8–12 kevyt, kivuton ROM',
                alt: next.alt || 'kuminauhaulko kierto / soutu',
                painNote: 'Olkapää: vältä kivuliasta yläasentoa'
              });
            }
          }
          if (hasBack) {
            if (/deadlift|maastaveto|squat|kyykky|good.?morning|rdl/.test(id)) {
              next = Object.assign({}, next, {
                sets: severe ? 'kevyt / tai jätä väliin' : '2–3×6–8 kevyt, neutraali selkä',
                alt: next.alt || 'hip thrust / glute bridge / dead bug',
                painNote: 'Alaselkä: pidä neutraali selkä, lopeta jos säteilee'
              });
            }
          }
          return next;
        });
      }
      s.durationMin = Math.round((s.durationMin || 60) * (severe ? 0.7 : 0.85));
      s.name = (s.name || 'Voima') + ' (kipu huomioitu)';
      const notes = [];
      if (hasKnee) notes.push('POLVI/IT: vältä hyppyjä ja syviä kyykkyjä kivun rajoissa. Suosi pakara-/lonkkavoimaa.');
      if (hasAnkleAcute) notes.push('NILKKA (akuutti): ei hyppyjä, epävakaata alustaa tai suunnanmuutoksia.');
      if (hasAchilles) notes.push('AKILLES/POHJA: ei plyometriaa; pohjetyö hallitusti.');
      if (hasShoulder) notes.push('OLKAPÄÄ: vältä raskaita pystypunnerruksia; suosi ulkokiertoa ja lapaluun tukea.');
      if (hasBack) notes.push('ALASELKÄ: kevennä vetoja/kyykkyjä; suosi dead bug / pakaratyötä.');
      s.notes = notes.join(' ') + ' ' + (s.notes || '');
      s.details = formatStrengthDetails(s);
      s.warmup = warmupFor('strength', true);
    }
    return s;
  }


  /** Salibandyn jälkeinen palautuspäivä – vahvistettu */
  function applySalibandyRecovery(session) {
    if (!session) return session;
    const s = JSON.parse(JSON.stringify(session));
    s.modified = 'salibandy-recovery';
    s.salibandyRecovery = true;
    if (s.type === 'run') {
      const hard = s.subtype === 'tempo' || s.subtype === 'intervals' ||
        s.subtype === 'strides' || s.subtype === 'long';
      s.subtype = 'easy';
      s.name = hard ? 'Palautus (salibandyn jälkeen)' : 'Helppo / palautus (salibandy+)';
      const base = s.distanceKm || 8;
      s.distanceKm = round1(clamp(base * (hard ? 0.55 : 0.75), 3, 7));
      s.details =
        '🏒 Eilinen salibandy oli kova kuormitus (TE jopa 5.0).\n' +
        'Tänään vain helppo palautus ~' + s.distanceKm + ' km tai kävely.\n' +
        'Syke 115–138, pysy alapäässä.\n' +
        'Ei tempoa, intervalleja eikä pitkää. Laatu aikaisintaan ylihuomenna.\n' +
        'Jos jalat raskaat: vaihda lihashuoltoon tai kävelyyn.';
      s.cueIds = ['easy_run_form'];
      s.warmup = warmupFor('run', true);
      s.mobility = mobilityFor('run');
    } else if (s.type === 'strength') {
      const short = shortStrength(s);
      Object.assign(s, short);
      s.type = 'strength';
      s.name = 'Voima kevyt (salibandy-palautus)';
      s.durationMin = 25;
      s.details =
        '🏒 Salibandyn jälkeinen palautuspäivä.\n' +
        'Pidä voima lyhyenä ja kevyenä (RPE ≤6) tai vaihda lihashuoltoon.\n' +
        (s.details || '');
      s.warmup = warmupFor('strength', true);
      s.mobility = mobilityFor('strength');
    } else if (s.type === 'rest' || s.type === 'mobility') {
      s.name = 'Palautus salibandyn jälkeen';
      s.details =
        '🏒 Hyvä – lepo/palautus salibandyn jälkeen.\n' +
        'Kevyt kävely + liikkuvuus ok. Ei lisäkuormaa.';
      s.mobility = mobilityFor('gentle');
    }
    return s;
  }


  // ---------- Valmentajan suunnitelma (coach-plan.json) ----------
  const COACH_TYPES = ['juoksu', 'koti', 'sali', 'lihashuolto', 'kavely', 'lepo'];
  const COACH_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  function coachStr(v, max) {
    return typeof v === 'string' ? v.slice(0, max || 4000) : '';
  }

  /** Validoi ja siistii coach-plan-objektin. Palauttaa null jos ei kelpaa. */
  // --- Olkapään (kiertäjäkalvo) kuntoutustila ---

  /** Päivittäinen ~10 min liikerata-/kuntoutusrutiini (kivuton alue). */
  const SHOULDER_REHAB_DAILY = [
    { id: 'codman_pendulum', label: 'Codman-heilurit', sets: '2×30–60 s / suunta' },
    { id: 'wall_walk', label: 'Seinäkävely sormilla', sets: '2×10' },
    { id: 'stick_flexion', label: 'Fleksio kepillä', sets: '2×10–15' },
    { id: 'stick_external_rotation', label: 'Passiivinen ulkokierto kepillä', sets: '2×10–15' },
    { id: 'scap_squeeze', label: 'Lapaluiden puristus', sets: '2×15' },
    { id: 'iso_external_rotation', label: 'Isometrinen ulkokierto', sets: '2×10 × 5 s (~30 %)' },
    { id: 'iso_internal_rotation', label: 'Isometrinen sisäkierto', sets: '2×10 × 5 s (~30 %)' },
    { id: 'cross_body_stretch', label: 'Venytys rinnan yli', sets: '2×30 s' }
  ];

  /** Voimapäivien loppuun lisättävä kevyt vahvistava olkapääblokki. */
  const SHOULDER_REHAB_STRENGTH = [
    { id: 'codman_pendulum', label: 'Codman-heilurit', sets: '60 s' },
    { id: 'band_external_rotation', label: 'Ulkokierto kuminauhalla (kevyt)', sets: '2–3×12–15' },
    { id: 'band_internal_rotation', label: 'Sisäkierto kuminauhalla (kevyt)', sets: '2–3×12–15' },
    { id: 'side_lying_external_rotation', label: 'Kylkimakuu-ulkokierto (0–1 kg)', sets: '2–3×10–15' },
    { id: 'band_row_low', label: 'Kevyt kuminauhasoutu matalalta', sets: '2–3×12–15' },
    { id: 'wall_circles', label: 'Pallo seinää vasten – pyöritykset', sets: '2×10 / suunta' }
  ];

  const SHOULDER_SAFE_POOLS = {
    sali: [
      { id: 'leg_press', label: 'Jalkaprässi', sets: '3×8–10 · RPE 6–7' },
      { id: 'sl_rdl_bw', label: 'Yhden jalan RDL ilman painoja', sets: '3×8/jalka' },
      { id: 'step_up_bw', label: 'Step-up ilman painoja', sets: '3×10/jalka' },
      { id: 'reverse_crunch', label: 'Käänteinen vatsarutistus', sets: '3×10–12' },
      { id: 'dead_bug', label: 'Dead bug – vain jalat, kädet rinnalla', sets: '3×8/puoli' },
      { id: 'calf_raise', label: 'Pohjenosto', sets: '3×12' }
    ],
    koti: [
      { id: 'wall_sit', label: 'Seinäistunta', sets: '3×30–60 s' },
      { id: 'lunge', label: 'Askelkyykky ilman painoja', sets: '3×10/jalka' },
      { id: 'sl_rdl_bw', label: 'Yhden jalan RDL ilman painoja', sets: '3×8/jalka' },
      { id: 'single_leg_hip_thrust', label: 'Yhden jalan lantionnosto (kädet rennosti)', sets: '3×10/jalka' },
      { id: 'reverse_crunch', label: 'Käänteinen vatsarutistus', sets: '3×10–12' },
      { id: 'dead_bug', label: 'Dead bug – vain jalat, kädet rinnalla', sets: '3×8/puoli' },
      { id: 'step_up_bw', label: 'Step-up ilman painoja', sets: '3×10/jalka' },
      { id: 'calf_raise', label: 'Pohjenosto step-laudalla', sets: '3×15' }
    ],
    mobility: [
      { id: 'hip_flexor_stretch', label: 'Lonkan koukistajan venytys', sets: '2×30 s/puoli' },
      { id: 'hamstring_stretch', label: 'Takareiden venytys', sets: '2×30 s/puoli' },
      { id: 'figure4_stretch', label: 'Figure-4 / piriformis', sets: '2×30 s/puoli' },
      { id: 'quad_stretch', label: 'Etureiden venytys', sets: '2×30 s/puoli' },
      { id: 'calf_stretch', label: 'Pohjevenytys', sets: '2×30 s/puoli' },
      { id: 'cross_body_stretch', label: 'Venytys rinnan yli (kevyt)', sets: '2×30 s' }
    ],
    warmup: [
      { id: 'codman_pendulum', label: 'Codman-heilurit', sets: '30 s / suunta' },
      { id: 'scap_squeeze', label: 'Lapaluiden puristus', sets: '10' },
      { id: 'leg_swings', label: 'Jalanheilautukset', sets: '10/puoli' },
      { id: 'bw_squat_warmup', label: 'Kehonpainokyykky', sets: '10' }
    ]
  };

  const SHOULDER_NOTE =
    'Olkapäätila (oikea kiertäjäkalvo): olkapäätä kuormittavat liikkeet poistettu ja korvattu jalka-/keskivartaloliikkeillä.';
  const SHOULDER_COACH_NOTE =
    'Olkapäätila: jätä tekstistä pois leuanvedot, punnerrukset, kaikki punnerrus-/pystyliikkeet, soudut painolla, face pullit, ab wheel ' +
    'ja lankut/kylkilankut käsillä. Tee tilalle seinäistunta, askelkyykky ja step-up ilman painoja, yhden jalan lantionnosto ja dead bug (vain jalat).';

  function shoulderLoader(lib) {
    lib = lib || (global && global.TreeniExercises) || null;
    return function (id) {
      if (!id) return false;
      if (lib && typeof lib.loadsShoulder === 'function') return lib.loadsShoulder(id);
      const e = lib && lib.getExercise ? lib.getExercise(id) : null;
      return !!(e && e.loadsShoulder);
    };
  }

  function filterShoulderList(list, loads, pool, minLen) {
    const src = Array.isArray(list) ? list : [];
    const kept = [];
    let removed = 0;
    src.forEach(function (ex) {
      if (!ex || loads(ex.id)) { removed++; return; }
      const e = Object.assign({}, ex);
      if (e.altId && loads(e.altId)) { delete e.altId; delete e.alt; }
      // Käsiin otettava kuorma (käsipainot / kahvakuula) kuormittaa olkapäätä → ilman painoja
      if (/käsipaino|kahvakuula|kettlebell/i.test(e.label || '')) {
        e.label = String(e.label).replace(/\s*\([^)]*(käsipaino|kahvakuula|kettlebell)[^)]*\)/gi, '')
          .replace(/\s*(käsipainoilla|kahvakuulalla)/gi, '').trim() + ' (ilman painoja)';
      }
      kept.push(e);
    });
    const target = Math.max(src.length, minLen || 0);
    if (removed && pool) {
      const have = {};
      kept.forEach(function (e) { have[e.id] = true; });
      for (let i = 0; i < pool.length && kept.length < target; i++) {
        if (!have[pool[i].id]) { kept.push(Object.assign({ shoulderSwap: true }, pool[i])); have[pool[i].id] = true; }
      }
    }
    return { list: kept, removed: removed };
  }

  /**
   * Olkapään kuntoutustila: poistaa olkapäätä kuormittavat liikkeet (exercises.js loadsShoulder),
   * korvaa jalka-/keskivartaloliikkeillä ja lisää kevyen kuntoutusblokin voima-/liikkuvuuspäiviin.
   * Idempotentti – voidaan ajaa uudelleen samalle sessiolle.
   */
  function applyShoulderRehab(session, lib) {
    if (!session) return session;
    const loads = shoulderLoader(lib);
    let s = JSON.parse(JSON.stringify(session));

    // Uinti kuormittaa olkapäätä → kävely
    if (s.type === 'other' && (s.subtype === 'uinti' || s.activityKind === 'uinti')) {
      const walk = buildOtherActivitySession('kavely');
      walk.name = 'Kävely (uinnin tilalle – olkapää)';
      walk.details = 'Uinti kuormittaa olkapäätä – tänään kävely tai pyöräily kevyesti.\n' + walk.details;
      s = walk;
    }

    let changed = false;
    if (s.warmup && Array.isArray(s.warmup.exercises)) {
      const r = filterShoulderList(s.warmup.exercises, loads, null, 0);
      if (r.removed) {
        const add = SHOULDER_SAFE_POOLS.warmup.filter(function (p) {
          return !r.list.some(function (e) { return e.id === p.id; });
        }).slice(0, Math.max(2, r.removed));
        s.warmup.exercises = add.map(function (x) { return Object.assign({}, x); }).concat(r.list);
        changed = true;
      }
    }
    if (s.mobility && Array.isArray(s.mobility.exercises)) {
      const r = filterShoulderList(s.mobility.exercises, loads, SHOULDER_SAFE_POOLS.mobility, 0);
      if (r.removed) { s.mobility.exercises = r.list; changed = true; }
      if (!s.mobility.exercises.length) s.mobility = null;
    }

    const isStrength = s.type === 'strength';
    const isMobility = s.type === 'mobility';
    if ((isStrength || isMobility) && Array.isArray(s.exercises) && s.exercises.length) {
      const pool = isMobility ? SHOULDER_SAFE_POOLS.mobility
        : (s.location === 'koti' ? SHOULDER_SAFE_POOLS.koti : SHOULDER_SAFE_POOLS.sali);
      const r = filterShoulderList(s.exercises, loads, pool, isStrength ? 4 : 0);
      if (r.removed) { s.exercises = r.list; changed = true; }
    }

    if (isStrength || isMobility) {
      s.rehabBlock = {
        id: 'shoulder_rehab',
        label: 'Olkapään kuntoutus (oikea kiertäjäkalvo)',
        durationMin: 10,
        note: 'Kevyt kuorma, 2–3×10–15. Tee vain kivuttomalla alueella – jos kipu nousee, tee pelkät heilurit ja liikeradat.',
        exercises: (isStrength ? SHOULDER_REHAB_STRENGTH : SHOULDER_REHAB_DAILY).map(function (x) { return Object.assign({}, x); })
      };
      if (s.coach && !(s.exercises && s.exercises.length)) {
        s.shoulderNote = SHOULDER_COACH_NOTE;
      }
    }

    if (changed) {
      if (isStrength && s.exercises && s.exercises.length) {
        s.notes = SHOULDER_NOTE; // alkuperäiset punnerrus-/leuanvetovinkit eivät päde olkapäätilassa
        if (s.equipmentNote) s.equipmentNote = s.location === 'koti'
          ? 'Välineet: step-lauta, seinä, kevyt kuminauha (kuntoutus).'
          : 'Välineet: jalkaprässi, step-lauta, kevyt kuminauha (kuntoutus).';
        s.details = formatStrengthDetails(s);
      } else if (isMobility && s.exercises) {
        s.details = (s.headline || s.name || 'Liikkuvuus') + '\n' +
          s.exercises.map(function (e) { return '• ' + (e.label || e.id) + (e.sets ? ' – ' + e.sets : ''); }).join('\n');
      }
    }
    s.shoulderRehab = true;
    return s;
  }

  /** coach-plan.json flags → { shoulderRehab: true|false } (vain tunnetut boolean-liput). */
  function parseCoachFlags(raw) {
    const out = {};
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if (typeof raw.shoulderRehab === 'boolean') out.shoulderRehab = raw.shoulderRehab;
    }
    return out;
  }


  function parseCoachPlan(obj) {
    if (typeof obj === 'string') {
      try { obj = JSON.parse(obj); } catch (e) { return null; }
    }
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.days)) return null;
    const days = [];
    const seen = {};
    obj.days.forEach(function (d) {
      if (!d || typeof d !== 'object' || !COACH_DATE_RE.test(String(d.date || ''))) return;
      const type = COACH_TYPES.indexOf(d.type) >= 0 ? d.type : 'juoksu';
      const day = {
        date: d.date,
        type: type,
        title: coachStr(d.title, 120) || 'Valmentajan treeni',
        details: coachStr(d.details),
        note: coachStr(d.note, 600),
        warmup: coachStr(d.warmup, 600),
        cooldown: coachStr(d.cooldown, 600),
        distanceKm: typeof d.distanceKm === 'number' && d.distanceKm > 0 && d.distanceKm < 60 ? d.distanceKm : null,
        durationMin: typeof d.durationMin === 'number' && d.durationMin > 0 && d.durationMin < 400 ? d.durationMin : null,
        subtype: coachStr(d.subtype, 30),
        options: (Array.isArray(d.options) ? d.options : []).slice(0, 6).map(function (o) {
          return {
            label: coachStr(o && o.label, 60) || 'Vaihtoehto',
            details: coachStr(o && o.details),
            distanceKm: o && typeof o.distanceKm === 'number' && o.distanceKm > 0 && o.distanceKm < 60 ? o.distanceKm : null
          };
        })
      };
      seen[day.date] = day; // viimeinen voittaa
    });
    Object.keys(seen).sort().forEach(function (k) { days.push(seen[k]); });
    return {
      version: typeof obj.version === 'number' ? obj.version : 0,
      updatedAt: coachStr(obj.updatedAt, 40),
      flags: parseCoachFlags(obj.flags),
      feedback: parseCoachFeedback(obj.feedback),
      done: parseCoachDone(obj.done),
      kmStats: parseKmStats(obj.kmStats),
      days: days
    };
  }

  /** Juoksu- ja hiihtokilometrit Garminista (coach-plan.json "kmStats") → siivottu tai null. */
  function parseKmStats(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const num = function (v, max) { return typeof v === 'number' && isFinite(v) && v >= 0 && v < (max || 1e5) ? v : 0; };
    const months = {};
    Object.keys(raw.months || {}).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort().forEach(function (k) {
      const m = raw.months[k] || {};
      months[k] = { km: num(m.km), runs: num(m.runs), longest: num(m.longest, 200),
        skiKm: num(m.skiKm), skiMin: num(m.skiMin, 1e6), skis: num(m.skis) };
    });
    const dayMap = function (obj) {
      const out = {};
      Object.keys(obj || {}).filter(function (k) { return COACH_DATE_RE.test(k); }).forEach(function (k) { out[k] = num(obj[k], 500); });
      return out;
    };
    return {
      since: COACH_DATE_RE.test(String(raw.since || '')) ? raw.since : '2026-10-23',
      updatedAt: coachStr(raw.updatedAt, 40),
      complete: raw.complete !== false,
      totalKm: num(raw.totalKm), runs: num(raw.runs),
      skiKm: num(raw.skiKm), skiMin: num(raw.skiMin, 1e6), skis: num(raw.skis),
      months: months,
      days: dayMap(raw.days),
      skiDays: dayMap(raw.skiDays)
    };
  }

  /** PT:n palaute: { 'YYYY-MM-DD': { title, text } } → sama muoto, siivottuna (max 60). */
  function parseCoachFeedback(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).filter(function (k) { return COACH_DATE_RE.test(k); }).sort().slice(-60).forEach(function (k) {
      const v = raw[k];
      const fb = typeof v === 'string' ? { title: '', text: v } : (v && typeof v === 'object' ? v : null);
      if (!fb) return;
      const text = coachStr(fb.text, 1500);
      if (!text) return;
      out[k] = { title: coachStr(fb.title, 80), text: text };
    });
    return out;
  }

  const DONE_TYPES = ['run', 'ski', 'walk', 'strength', 'floorball', 'cycle', 'swim', 'mobility', 'other'];
  const DONE_LABELS = { run: 'Juoksu', ski: 'Hiihto', walk: 'Kävely', strength: 'Voimatreeni', floorball: 'Salibandy',
    cycle: 'Pyöräily', swim: 'Uinti', mobility: 'Liikkuvuus', other: 'Liikunta' };

  /** Tehdyt treenit (Garmin/käsin): { 'YYYY-MM-DD': [{type, km, min, pace, source, id}] } – vain treenidata. */
  function parseCoachDone(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).filter(function (k) { return COACH_DATE_RE.test(k); }).sort().slice(-90).forEach(function (k) {
      const list = Array.isArray(raw[k]) ? raw[k] : [];
      const items = [];
      list.slice(0, 10).forEach(function (e) {
        if (!e || typeof e !== 'object') return;
        const type = DONE_TYPES.indexOf(e.type) >= 0 ? e.type : 'other';
        const id = typeof e.id === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(e.id) ? e.id : null;
        if (!id) return;
        const km = typeof e.km === 'number' && e.km > 0 && e.km < 200 ? Math.round(e.km * 100) / 100 : null;
        const min = typeof e.min === 'number' && e.min > 0 && e.min < 1000 ? Math.round(e.min) : null;
        const pace = typeof e.pace === 'string' && /^\d{1,2}:\d{2}$/.test(e.pace) ? e.pace : null;
        items.push({ type: type, km: km, min: min, pace: pace, source: e.source === 'garmin' ? 'garmin' : 'manual', id: id });
      });
      if (items.length) out[k] = items;
    });
    return out;
  }

  function doneLabel(type) { return DONE_LABELS[type] || DONE_LABELS.other; }

  /** Session → tehdyn treenin tyyppi (run|walk|strength|floorball|mobility|…) tai null (lepo). */
  function sessionKind(session, status) {
    const s = session;
    if (status === 'salibandy' || (s && (s.salibandyDay || s.subtype === 'salibandy' || s.modified === 'salibandy'))) return 'floorball';
    if (!s) return null;
    // Valmentajan "Kävely"-vaihtoehto juoksupäivälle → kävely, ei juoksu
    if ((s.type === 'run' || s.type === 'race') && s.coach && WALK_RE.test(s.coach.selected || '')) return 'walk';
    if (s.type === 'run' || s.type === 'race') return 'run';
    if (s.type === 'strength') return 'strength';
    if (s.type === 'mobility') return 'mobility';
    if (s.type === 'other') {
      if (s.subtype === 'kavely' || /kävely/i.test(s.name || '')) return 'walk';
      if (s.subtype === 'pyoraily') return 'cycle';
      if (s.subtype === 'hiihto') return 'ski';
      if (s.subtype === 'uinti') return 'swim';
      return 'other';
    }
    return null;
  }

  /** Lokimerkintä → tyyppi (vanhoissa merkinnöissä ei ole kind-kenttää). */
  const WALK_RE = /k[äa]vely|walk/i;
  function logKind(l) {
    if (!l) return null;
    // Juoksupäivä merkitty tehdyksi "Kävely"-vaihtoehdolla (vanhat merkinnät: kind 'run') → kävely
    if (!l.garminId && WALK_RE.test(l.coach || '') ) return 'walk';
    if (l.kind) return l.kind;
    if (/salibandy|säbä/i.test(l.name || '')) return 'floorball';
    if (/hiihto/i.test(l.name || '')) return 'ski';
    if (l.type === 'run' || l.type === 'race') return 'run';
    if (l.type === 'strength') return 'strength';
    if (l.type === 'mobility') return 'mobility';
    if (/kävely/i.test(l.name || '')) return 'walk';
    return l.type === 'rest' ? null : 'other';
  }

  /** Uusin palaute päiville [fromIso..toIso]; null jos ei. */
  function latestCoachFeedback(plan, fromIso, toIso) {
    const fb = plan && plan.feedback;
    if (!fb) return null;
    const keys = Object.keys(fb).filter(function (k) { return k >= fromIso && k <= toIso; }).sort();
    if (!keys.length) return null;
    const k = keys[keys.length - 1];
    return Object.assign({ date: k }, fb[k]);
  }

  /** Lyhyt sisältöavain: muuttuu kun valmentaja muuttaa päivän sisältöä. */
  function coachKey(day) {
    const str = JSON.stringify(day || {});
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return (day && day.date || '') + ':' + h.toString(36);
  }

  function findCoachDay(plan, iso) {
    if (!plan || !Array.isArray(plan.days)) return null;
    for (let i = 0; i < plan.days.length; i++) if (plan.days[i].date === iso) return plan.days[i];
    return null;
  }

  /** Muuntaa valmentajan päivän sovelluksen sessio-objektiksi. */
  function coachDayToSession(day, meta) {
    if (!day) return null;
    let base;
    switch (day.type) {
      case 'koti': base = { type: 'strength', location: 'koti', subtype: day.subtype || 'coach', exercises: [] }; break;
      case 'sali': base = { type: 'strength', location: 'sali', subtype: day.subtype || 'coach', exercises: [] }; break;
      case 'lihashuolto': base = { type: 'mobility', subtype: 'lihashuolto', exercises: [] }; break;
      case 'kavely': base = { type: 'other', subtype: 'kavely', lightLoad: true }; break;
      case 'lepo': base = { type: 'rest', subtype: 'rest' }; break;
      default: base = { type: 'run', subtype: day.subtype || 'easy' };
    }
    const s = Object.assign(base, {
      name: day.title,
      details: day.details || '',
      coach: {
        key: coachKey(day),
        date: day.date,
        note: day.note || '',
        warmup: day.warmup || '',
        cooldown: day.cooldown || '',
        options: (day.options || []).map(function (o) { return Object.assign({}, o); }),
        updatedAt: (meta && meta.updatedAt) || '',
        version: (meta && meta.version) || 0
      }
    });
    if (day.distanceKm) s.distanceKm = day.distanceKm;
    if (day.durationMin) s.durationMin = day.durationMin;
    if (/^(boost|light|none)$/.test(day.routine || '')) s.coach.routine = day.routine; // Päivärutiini-ohitus
    return s;
  }

  /** Valitsee valmentajan vaihtoehdon (esim. Kevennetty) sessioksi. */
  function applyCoachOption(session, idx) {
    if (!session || !session.coach) return null;
    const opt = (session.coach.options || [])[idx];
    if (!opt) return null;
    const s = JSON.parse(JSON.stringify(session));
    s.name = (s.name || '').replace(/ – .*$/, '') + ' – ' + opt.label;
    s.details = opt.details || s.details;
    if (opt.distanceKm) s.distanceKm = opt.distanceKm;
    // "Kävely"-vaihtoehto juoksupäivälle: ei juoksukilometrejä (kävely ≠ juoksu)
    if ((s.type === 'run' || s.type === 'race') && WALK_RE.test(opt.label || '')) {
      s.type = 'other'; s.subtype = 'kavely'; s.lightLoad = true;
      s.distanceKm = opt.distanceKm || null;
    }
    s.modified = /kevenn/i.test(opt.label) ? 'keventa' : /kovenn/i.test(opt.label) ? 'koventa' : 'coach-option';
    s.coach.selected = opt.label;
    return s;
  }

  function coachOptionIndex(session, re) {
    if (!session || !session.coach) return -1;
    const opts = session.coach.options || [];
    for (let i = 0; i < opts.length; i++) if (re.test(opts[i].label)) return i;
    return -1;
  }

  global.TreeniPlan = {
    MILESTONES,
    MILESTONES_VERSION,
    milestoneOn,
    upcomingMilestones,
    milestoneSession,
    milestoneAdjust,
    capLongRunKm,
    THRESHOLD_PACE,
    THRESHOLD_TIP,
    weeklyKmCap,
    MONTH_KM_CAPS,
    LONG_RUN_CAPS,
    DELOAD_ANCHOR,
    DELOAD_LABEL,
    isDeloadWeekDate,
    deloadNote,
    EASY_HR,
    parseKmStats,
    buildSkiSession,
    parseCoachPlan,
    parseCoachFeedback,
    latestCoachFeedback,
    parseCoachDone,
    sessionKind,
    logKind,
    doneLabel,
    coachKey,
    findCoachDay,
    coachDayToSession,
    applyCoachOption,
    coachOptionIndex,
    COACH_TYPES,
    PHASES,
    DOW_FI,
    DOW_FULL,
    STRENGTH,
    WARMUP_TEMPLATES,
    MOBILITY_TEMPLATES,
    toISO,
    parseISO,
    addDays,
    daysBetween,
    startOfWeek,
    generatePlan,
    getDayFromPlan,
    getPhase,
    fitnessBaseline,
    applyKeventa,
    applyKoventa,
    applyShortSwap,
    swapLocation,
    noGymSession,
    swapSessionType,
    buildLihashuoltoSession,
    buildEasyRunSession,
    applySick,
    applyNoMood,
    shortStrength,
    formatStrengthDetails,
    warmupFor,
    mobilityFor,
    attachPrep,
    STRENGTH_RAW,
    fourWeekSuggestion,
    applySalibandy,
    applyPainSoftening,
    hasActiveKneePain,
    hasActiveCondition,
    getActivePains,
    KNEE_HELP_EXERCISE_IDS,
    CONDITIONS,
    kneeTipCardHtml,
    tipCardHtml,
    allTipCards,
    conditionsForTips,
    conditionsNeedingPrompt,
    inferConditionId,
    detectConditionLabel,
    matchedConditions,
    normalizeAnswers,
    TIP_DISCLAIMER,
    buildOtherActivitySession,
    OTHER_ACTIVITY_KINDS,
    applySalibandyRecovery,
    applyShoulderRehab,
    parseCoachFlags,
    SHOULDER_REHAB_DAILY,
    SHOULDER_REHAB_STRENGTH
  };
})(typeof window !== 'undefined' ? window : global);
