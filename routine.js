/**
 * Päivärutiini – päivittäinen aamu-/ilta-liikkuvuus + erillinen GtG-boost sopivina päivinä.
 * Deterministinen generaattori: päivän treenityyppi + edellinen/seuraava päivä →
 *  - am + pm joka päivä (paitsi sairas/none)
 *  - boost (2–3 submaksimaalista kehonpainoliikettä) vain sopivina päivinä
 * Kierto päivämäärän mukaan → peräkkäiset päivät eroavat. Ei terveysdataa.
 */
(function (global) {
  'use strict';

  const DAY_MS = 86400000;
  function dayNum(iso) {
    const p = String(iso).split('-').map(Number);
    return Math.round(Date.UTC(p[0], p[1] - 1, p[2]) / DAY_MS);
  }

  /** Leuanvedon GtG-annos etenee päivämäärän mukaan (lähtötaso ~5 myötäotteella, tavoite 3×8). */
  function pullDose(iso) {
    if (iso < '2026-11-16') return { sets: 5, reps: '3' };
    if (iso < '2026-12-14') return { sets: 6, reps: '3' };
    if (iso < '2027-01-11') return { sets: 6, reps: '3–4' };
    return { sets: 6, reps: '4' };
  }

  const SIDE_CUE = 'Aloita sillä puolella, joka tuntuu kireämmältä tai heikommalta; tee toinen puoli samalla määrällä.';
  const RDL_CUE = 'Kallistu lonkasta, selkä neutraalina. Älä pakota syvyyttä – vain niin pitkälle kuin hallinta säilyy. ' + SIDE_CUE;

  // ---------- Liikkeet ----------
  function pullItem(iso, n) {
    const under = n % 2 === 1;
    const d = pullDose(iso);
    return {
      key: 'pull', ex: under ? 'chin_up' : 'pullup',
      name: under ? 'Leuanveto vastaotteella (GtG)' : 'Leuanveto myötäotteella (GtG)',
      dose: d.sets + ' × ' + d.reps + ' pitkin päivää',
      cue: 'Täysi ote: peukalo tangon alle. Pienet sarjat pitkin päivää, ≥ 15 min välein. Lopeta sarja kun 2 toistoa jäisi vielä varaan – ei koskaan uupumukseen.',
      sets: d.sets, shoulder: true
    };
  }
  const UPPER = {
    push: { key: 'push', ex: 'push_up', name: 'Punnerrus', dose: '3 × 10', cue: 'Vartalo suorana, kyynärpäät ~45°. Jos 10. toisto hidastuu, tee 8.', shoulder: true },
    dip: { key: 'dip', ex: 'chair_dip', name: 'Dippi tuolilla', dose: '2 × 8–12', cue: 'Kyynärpäät 90°, ei syvemmälle. Hartiat alhaalla.', shoulder: true },
    core: { key: 'core', ex: 'plank', exs: ['plank', 'side_plank'], name: 'Lankku + kylkilankku', dose: '3 × 30–45 s + 2 × 20–30 s / puoli', cue: 'Pakarat ja vatsa tiukkana, lantio linjassa. Lopeta kun asento alkaa pettää. ' + SIDE_CUE, shoulder: true }
  };
  const LEGS = [
    { key: 'bss', ex: 'bulgarian_split_squat', name: 'Bulgarialainen askelkyykky', dose: '2 × 8–10 / jalka', cue: 'Takajalka tuolille, etupolvi varpaiden suuntaan. 2–3 toistoa varaan. ' + SIDE_CUE, legs: true },
    { key: 'calf', ex: 'calf_raise', name: 'Yhden jalan pohjenosto rappusella', dose: '2 × 12–15 / jalka', cue: 'Oikea ensin. Täysi liike: kanta alas venytykseen, ylös varpaille. Hitaasti alas (3 s). ' + SIDE_CUE, legs: true },
    { key: 'bridge', ex: 'glute_bridge', name: 'Lantionnosto kahdella jalalla', dose: '2 × 12, pito 2–3 s', cue: 'Kantapäät kauempana pakarasta, paina kantapäillä – pakara tekee työn. Jos takareisi kiristyy: lopeta, suorista jalka ja venytä kevyesti. Eteneminen: kun menee ilman kiristystä, nosto kahdella ja lasku hitaasti oikealla jalalla.', legs: true },
    { key: 'lunge', ex: 'lunge', name: 'Askelkyykky taaksepäin', dose: '2 × 10 / jalka', cue: 'Askel taakse, etupolvi nilkan päällä, rinta pystyssä. ' + SIDE_CUE, legs: true }
  ];
  const BALANCE = [
    { key: 'bal1', ex: 'sl_balance', name: 'Yhden jalan seisonta', dose: '3 × 30 s / jalka', cue: 'Paljain jaloin, polvi pehmeänä. Helppoa? Silmät kiinni. ' + SIDE_CUE, balance: true },
    { key: 'bal2', ex: 'sl_rdl_bw', name: 'Yhden jalan RDL ilman painoja', dose: '2 × 8 / jalka', cue: RDL_CUE, balance: true },
    { key: 'bal3', ex: 'tandem_stance', name: 'Tandemseisonta', dose: '3 × 30 s', cue: 'Kantapää varpaiden eteen samalle linjalle. Eteneminen: silmät kiinni.', balance: true },
    { key: 'bal4', ex: 'sl_reach', name: 'Yhden jalan kurotus (tähti)', dose: '2 × 6 / jalka', cue: 'Kurota eteen, sivulle ja taakse – tukipolvi varpaiden linjassa. ' + SIDE_CUE, balance: true }
  ];

  // Aamu: dynaaminen liikkuvuus (lonkat, nilkat, rintaranka + kevyt aktivointi)
  const AM_POOL = [
    { key: 'am_swing', ex: 'leg_swings', name: 'Jalan heilautukset', dose: '10 / suunta / jalka', cue: 'Rento heilautus eteen–taakse ja sivulle. Pidä lantio vakaana. ' + SIDE_CUE },
    { key: 'am_hip', ex: 'hip_opener', name: 'Lonkan avaus (dynaaminen)', dose: '8 / puoli', cue: 'Hallittu liike, ei kipua. ' + SIDE_CUE },
    { key: 'am_ankle', ex: 'ankle_mobility', name: 'Nilkan liikkuvuus (polvi seinään)', dose: '8 / puoli', cue: 'Kantapää maassa, vie polvi kohti seinää varpaiden linjassa. ' + SIDE_CUE },
    { key: 'am_thor', ex: 'thoracic_opener', name: 'Rintarangan kierto', dose: '6 / puoli', cue: 'Nelinkontin tai kyljellään: kierrä rintakea auki uloshengityksellä. ' + SIDE_CUE },
    { key: 'am_wgs', ex: 'worlds_greatest_stretch', name: 'World’s greatest stretch', dose: '5 / puoli', cue: 'Askel eteen, kyynärpää kohti maata, avaa rintakea. Dynaaminen, ei staattista venytystä. ' + SIDE_CUE },
    { key: 'am_arm', ex: 'arm_circles', name: 'Käsien pyöritykset', dose: '10 / suunta', cue: 'Isot, rennät ympyrät – hartiat alas.' },
    { key: 'am_glute', ex: 'glute_activation', name: 'Pakaran aktivointi', dose: '10 / puoli', cue: 'Kevyt aktivointi, ei uupumukseen. ' + SIDE_CUE },
    { key: 'am_cat', ex: 'cat_cow', name: 'Kissa–lehmä', dose: '8 hidasta', cue: 'Liike nikama kerrallaan, hengitys ohjaa.' }
  ];

  // Ilta: venyttely + liikkuvuus (pohkeet/akilles, takareidet, lonkankoukistajat, pakarat, selkä)
  const PM_STRETCH = [
    { key: 'pm_calf', ex: 'calf_stretch', name: 'Pohje- ja akillesvenytys', dose: '2 × 30–45 s / puoli (suora + koukku)', cue: 'Oikea ensin. Seinää vasten: ensin takapolvi suorana, sitten koukussa (soleus). Halutessa kevyt rullaus/hieronta 1–2 min. ' + SIDE_CUE },
    { key: 'pm_ham', ex: 'hamstring_stretch', name: 'Takareiden venytys (selin, hihna/pyyhe)', dose: '2 × 30–45 s / puoli', cue: 'Oikea ensin ja hieman pidempään. Selinmakuu, hihna/pyyhe jalkaterän ympäri. Nosta jalka suoraksi pehmeästi – ei pakota. ' + SIDE_CUE },
    { key: 'pm_glide', ex: 'hamstring_nerve_glide', name: 'Takareiden liukuliike (istuen)', dose: '10 rauhallista (oikea; vasen vapaaehtoinen)', cue: 'Istu ryhdikkäästi. Ojenna polvea samalla kun nostat päätä; palaa koukkuun samalla kun lasket päätä. 10 rauhallista, oikea puoli; vasen vapaaehtoinen. Ei kipua. ' + SIDE_CUE },
    { key: 'pm_hipflex', ex: 'hip_flexor_stretch', name: 'Lonkankoukistajan venytys (polviseisonta)', dose: '2 × 30–40 s / puoli', cue: 'Polviseisonta, purista takajalan pakaraa ja työnnä lantiota eteen – ei notkoa. ' + SIDE_CUE },
    { key: 'pm_glute', ex: 'figure4_stretch', name: 'Pakaravenytys (kyyhky / figure-4)', dose: '2 × 40 s / puoli', cue: 'Nilkka vastakkaisen polven päälle, vedä reittä rintaa kohti. Lantio tasaisena. ' + SIDE_CUE },
    { key: 'pm_quad', ex: 'quad_stretch', name: 'Etureiden venytys', dose: '2 × 30 s / puoli', cue: 'Seisten tai kyljellään, vedä kantapäätä pakaraan. Lantio eteen. ' + SIDE_CUE },
    { key: 'pm_thor', ex: 'thoracic_opener', name: 'Rintarangan kierto (ilta)', dose: '6 / puoli', cue: 'Rauhallinen avaus, hengitys pitkänä. ' + SIDE_CUE },
    { key: 'pm_cat', ex: 'cat_cow', name: 'Kissa–lehmä', dose: '8–10 hidasta', cue: 'Rauhallinen selän liikkuvuus illalla.' },
    { key: 'pm_child', ex: 'childs_pose', name: 'Lapsen asento', dose: '45–60 s', cue: 'Hengitä kylkiin, rentouta alaselkä.' }
  ];

  const PM_CLAM = {
    key: 'pm_clam', ex: 'clamshell', name: 'Simpukka (kylkimakuu)',
    dose: '2 × 10–12 / puoli',
    cue: 'Oikea ensin. Kylkimakuu, polvet koukussa. Avaa yläpolvea pitäen nilkat yhdessä. Lantio vakaa. ' + SIDE_CUE, legs: true
  };

  // Vanha STRETCH-alias (testit / recovery-yhteensopivuus)
  const STRETCH = [
    { key: 'hipflex', ex: 'hip_flexor_stretch', name: 'Lonkankoukistajan venytys', dose: '2 × 40 s / puoli', cue: 'Polviseisonta, purista takajalan pakaraa ja työnnä lantiota eteen – ei notkoa.' },
    { key: 'calfst', ex: 'calf_stretch', name: 'Pohje- ja akillesvenytys', dose: '2 × 30–45 s / puoli (suora + koukku)', cue: 'Seinää vasten: ensin takapolvi suorana, sitten koukussa (akilles/leveä kantalihas). Halutessa kevyt rullaus/hieronta 1–2 min.' },
    { key: 'ham', ex: 'hamstring_stretch', name: 'Takareiden venytys (selin, hihna/pyyhe)', dose: '2 × 30–45 s / puoli', cue: 'Selinmakuu, hihna/pyyhe jalkaterän ympäri. Pehmeä venytys, ei pakota. Kireämpi puoli ensin ja hieman pidempään.' },
    { key: 'glute', ex: 'figure4_stretch', name: 'Pakaravenytys (kyyhky / figure-4)', dose: '2 × 40 s / puoli', cue: 'Nilkka vastakkaisen polven päälle, vedä reittä rintaa kohti. Lantio tasaisena.' },
    { key: 'thor', ex: 'thoracic_opener', name: 'Rintarangan kierto', dose: '8 / puoli', cue: 'Nelinkontin, käsi niskan taakse ja kierrä kyynärpää kattoa kohti. Uloshengitys avauksessa.' },
    { key: 'catcow', ex: 'cat_cow', name: 'Kissa–lehmä', dose: '10 hidasta', cue: 'Liike nikama kerrallaan, hengitys ohjaa: sisään notko, ulos köyry.' },
    { key: 'ankle', ex: 'ankle_mobility', name: 'Nilkan liikkuvuus (polvi seinään)', dose: '10 / puoli', cue: 'Kantapää maassa, vie polvi kohti seinää varpaiden linjassa.' }
  ];

  // ---------- Päivän luokittelu ----------
  const HARD_SUB = /^(tempo|intervals|test|race|halfmarathon|marathon)$/;
  function sessionKind(s) {
    if (!s) return 'none';
    const t = s.type, st = s.subtype || '';
    const name = String(s.name || '');
    if (t === 'race') return 'hard';
    if (t === 'run') {
      if (HARD_SUB.test(st) || /kynnys|intervall|kuntotesti|⏱️/i.test(name)) return 'hard';
      if (st === 'long') return 'long';
      return 'easy';
    }
    if (t === 'strength') return 'strength';
    if (t === 'mobility') return 'mobility';
    if (t === 'rest') return 'rest';
    if (t === 'other') {
      if (st === 'salibandy') return 'strength';
      if (st === 'kavely') return 'walk';
      return 'easy';
    }
    return 'easy';
  }
  /** Yövuoropäivä tai yövuoron jälkeinen päivä (valmentajan otsikosta) → vähän unta. */
  function nightHeavy(s) {
    return !!s && /yövuor/i.test(String(s.name || ''));
  }

  function shiftHint(s) {
    const name = String((s && s.name) || '');
    if (/iltavuor/i.test(name)) return 'iltavuoro';
    if (/aamuvuor/i.test(name)) return 'aamuvuoro';
    if (/yövuor/i.test(name)) return 'yövuoro';
    return null;
  }

  /** Lyhyt "Milloin tänään" -vinkki AM/PM:lle suhteessa treeniin ja vuoroon. */
  function timingTip(s, kind) {
    if (!s) return null;
    const shift = shiftHint(s);
    const name = String(s.name || '');
    if (kind === 'hard') {
      if (shift === 'iltavuoro' || /ennen iltavuoro/i.test(name)) {
        return 'AM: dynaaminen liikkuvuus kotona ennen kovaa treeniä. PM: venyttely kovan treenin jälkeen, ennen iltavuoroa.';
      }
      if (shift === 'aamuvuoro') {
        return 'AM: lyhyt dynaaminen liikkuvuus ennen aamuvuoroa / treeniä. PM: venyttely treenin jälkeen illalla.';
      }
      return 'AM: dynaaminen liikkuvuus ennen kovaa treeniä (ei staattista venytystä juuri ennen). PM: venyttely treenin jälkeen.';
    }
    if (kind === 'long') {
      return 'AM: kevyt dynaaminen liikkuvuus ennen pitkää. PM: venyttely pitkän jälkeen.';
    }
    if (kind === 'easy') {
      if (shift === 'iltavuoro' || /ennen iltavuoro/i.test(name)) {
        return 'AM: dynaaminen liikkuvuus aamulla. PM: venyttely lenkin jälkeen / ennen iltavuoroa.';
      }
      if (shift === 'aamuvuoro') {
        return 'AM: lyhyt liikkuvuus ennen aamuvuoroa tai lenkkiä. PM: venyttely illalla.';
      }
      return 'AM: dynaaminen liikkuvuus ennen helppoa lenkkiä. PM: venyttely lenkin jälkeen.';
    }
    if (kind === 'strength') {
      if (/salibandy/i.test(name) || (s.subtype === 'salibandy')) {
        return 'AM: kevyt dynaaminen liikkuvuus. PM: venyttely salibandyn jälkeen.';
      }
      if (shift === 'iltavuoro' || /ennen iltavuoro/i.test(name)) {
        return 'AM: dynaaminen liikkuvuus. PM: venyttely kotipiirin jälkeen, ennen iltavuoroa.';
      }
      if (shift === 'yövuoro' || /ennen yövuoro/i.test(name)) {
        return 'AM: lyhyt dynaaminen liikkuvuus. PM: venyttely piirin jälkeen, ennen torkkuja / yövuoroa.';
      }
      if (shift === 'aamuvuoro') {
        return 'AM: lyhyt liikkuvuus ennen aamuvuoroa tai piiriä. PM: venyttely illalla.';
      }
      return 'AM: dynaaminen liikkuvuus ennen voimaa. PM: venyttely treenin jälkeen.';
    }
    if (kind === 'walk') {
      if (shift === 'aamuvuoro') return 'AM: lyhyt liikkuvuus aamulla. PM: venyttely kävelyn jälkeen illalla.';
      if (shift === 'yövuoro') return 'AM: kevyt liikkuvuus kun jaksat. PM: venyttely kävelyn jälkeen.';
      return 'AM: dynaaminen liikkuvuus. PM: venyttely kävelyn jälkeen (jos kävelykortissa on jo liikkuvuus, PM voi olla lyhyempi).';
    }
    if (kind === 'mobility') {
      return 'AM: lyhyt dynaaminen avaus. PM: illan venyttely + tasapaino – vältä samaa kuin lihashuoltotreenissä.';
    }
    if (kind === 'rest') {
      if (shift === 'yövuoro') return 'AM: vain jos jaksat. PM: kevyt venyttely ennen unta.';
      return 'AM: lyhyt dynaaminen avaus. PM: rauhallinen venyttely illalla.';
    }
    return 'AM: dynaaminen liikkuvuus aamulla. PM: venyttely illalla.';
  }

  /** Kevyt pohjeosio (illan loppu): ei samana päivänä kova/säbä/pitkä/kuntopiiri; ei juuri ennen kovaa/pitkää. */
  function calfDayOk(kind, s, nextKind, nextS) {
    if (kind === 'hard' || kind === 'long' || kind === 'strength') return false;
    if (s && s.subtype === 'salibandy') return false;
    if (nextKind === 'hard' || nextKind === 'long' || (nextS && nextS.type === 'race')) return false;
    return true;
  }

  function pickRotated(pool, n, count, step) {
    const out = [];
    const len = pool.length;
    const start = ((n % len) + len) % len;
    const st = step || 1;
    const seen = {};
    for (let i = 0; out.length < count && i < len * 2; i++) {
      const idx = (start + i * st) % len;
      if (seen[idx]) continue;
      seen[idx] = true;
      out.push(pool[idx]);
    }
    // Täydennä järjestyksessä jos step jätti aukkoja (parillinen pool + step 2)
    for (let i = 0; out.length < count && i < len; i++) {
      const idx = (start + i) % len;
      if (seen[idx]) continue;
      seen[idx] = true;
      out.push(pool[idx]);
    }
    return out.map((x) => Object.assign({}, x));
  }

  // Aamun kiinteä alku: nilkkapumput sängyssä / ennen ylösnousua
  const AM_ANKLE_PUMPS = {
    key: 'am_pumps', ex: 'ankle_pumps', name: 'Nilkkapumput (varpaat kohti)',
    dose: '10–15 / jalka',
    cue: 'Ennen ylösnousua tai aamun aluksi: vedä varpaita kohti itseä, sitten ojenna. Rauhallinen rytmi. ' + SIDE_CUE
  };

  function buildAm(iso) {
    const n = dayNum(iso);
    // Kiinteä alku + 3–4 dynaamista (~5–8 min)
    const items = [Object.assign({}, AM_ANKLE_PUMPS)].concat(pickRotated(AM_POOL, n, 3, 2));
    return {
      title: 'Aamun liikkuvuus',
      minutes: '5–8 min',
      items: items
    };
  }

  function buildPm(iso, includeBalance) {
    const n = dayNum(iso);
    // Kiinteä iltaosio (~10–12 min): pohje → takareisi (hihna) → liukuliike → lonkankoukistaja + 1 vaihtuva
    const fixedKeys = { pm_calf: 1, pm_ham: 1, pm_glide: 1, pm_hipflex: 1 };
    const fixed = ['pm_calf', 'pm_ham', 'pm_glide', 'pm_hipflex'].map((k) => {
      const x = PM_STRETCH.find((e) => e.key === k);
      return Object.assign({}, x);
    });
    const restPool = PM_STRETCH.filter((x) => !fixedKeys[x.key]);
    const items = fixed.concat(pickRotated(restPool, n, 1, 1));
    if (includeBalance) {
      items.push(Object.assign({}, BALANCE[((n % 4) + 4) % 4]));
    }
    return {
      title: 'Illan venyttely',
      minutes: '10–12 min',
      items: items
    };
  }

  function collectKeys(block) {
    const keys = {};
    (block || []).forEach((x) => { if (x && x.key) keys[x.key] = true; });
    return keys;
  }

  /**
   * @param {string} iso
   * @param {{session, status, prev:{session,status}, next:{session,status}, deload:boolean, shoulderRehab:boolean}} ctx
   * @returns {{mode:'boost'|'light'|'none', title?, reason, minutes?, items:[], am?, pm?, boost?, timing?}}
   */
  function buildRoutine(iso, ctx) {
    ctx = ctx || {};
    const s = ctx.session;
    const n = dayNum(iso);
    if (!s || ctx.status === 'sairas' || s.subtype === 'sick') {
      return { mode: 'none', reason: 'Sairas = lepo, ei päivärutiinia.', items: [], am: null, pm: null, boost: null, timing: null };
    }
    const kind = sessionKind(s);
    const prevS = ctx.prev && ctx.prev.status !== 'sairas' ? ctx.prev.session : null;
    const nextS = ctx.next ? ctx.next.session : null;
    const prevKind = sessionKind(prevS), nextKind = sessionKind(nextS);
    const forced = s.routine || (s.coach && s.coach.routine) || null;

    if (forced === 'none') {
      return { mode: 'none', reason: 'Valmentaja: ei päivärutiinia tänään.', items: [], am: null, pm: null, boost: null, timing: null };
    }

    // Boost estetty samoilla säännöillä kuin ennen (light-päivät)
    let noBoost = null;
    if (kind === 'strength') noBoost = s.subtype === 'salibandy' ? 'Salibandypäivä – ei GtG-lisää.' : 'Kuntopiiri-/voimapäivä – ei lisävoimaa.';
    else if (kind === 'hard') noBoost = 'Kova juoksupäivä – ei GtG-lisää.';
    else if (kind === 'long') noBoost = 'Pitkän lenkin päivä – ei GtG-lisää.';
    else if (nightHeavy(s)) noBoost = 'Yövuoropäivä / vähän unta – ei GtG-lisää.';
    else if (prevKind === 'long') noBoost = 'Pitkän lenkin jälkeinen päivä – ei GtG-lisää.';
    else if (prevS && prevS.subtype === 'salibandy') noBoost = 'Salibandyn jälkeinen päivä – ei GtG-lisää.';
    else if (kind === 'mobility') noBoost = 'Lihashuoltopäivä – ei GtG-lisää.';
    if (forced === 'light' && !noBoost) noBoost = 'Valmentaja: tänään kevyt päivärutiini (ei GtG).';
    if (forced === 'boost') noBoost = null;

    // Balance most evenings (≈ every other evening by day number)
    const balTonight = (n % 2) === 0 || kind === 'mobility' || kind === 'rest' || kind === 'walk';
    const am = buildAm(iso);
    const pm = buildPm(iso, balTonight);
    const timing = timingTip(s, kind);

    let boost = null;
    if (!noBoost) {
      const legsOk = !(nextKind === 'hard' || nextKind === 'long') && !(nextS && nextS.type === 'race');
      const shoulderOk = !ctx.shoulderRehab;
      const deload = !!ctx.deload || /kevennysviikko/i.test(String(s.name || ''));
      const upperPool = [UPPER.push, UPPER.core, UPPER.dip, UPPER.core];
      const items = [];
      if (shoulderOk) {
        items.push(pullItem(iso, n));
        items.push(upperPool[((n % 4) + 4) % 4]);
      } else {
        items.push(BALANCE[((n % 4) + 4) % 4]);
      }
      // Jalkojen pohje-/pakaraosio menee illan rutiinin alkuun (ei boostiin)
      if (!deload || !shoulderOk) {
        if (!legsOk) {
          const b = BALANCE.filter((x) => x.key !== 'bal2');
          let pick = b[((n % 3) + 3) % 3];
          if (items.some((x) => x.key === pick.key)) pick = b[((n + 1) % 3 + 3) % 3];
          items.push(pick);
        } else if (!shoulderOk) {
          const extra = LEGS.filter((x) => x.key !== 'calf' && x.key !== 'bridge');
          items.push(extra[((n + 2) % extra.length + extra.length) % extra.length]);
        }
      }
      let reason = 'Kevyt lisävoima: submaksimaalinen, ei koskaan uupumukseen. Täysi ote leuoissa (peukalo tangon alle).';
      if (!legsOk) reason += ' Huomenna kova/pitkä → ei jalkaliikkeitä tänään.';
      if (deload && shoulderOk) reason += ' Kevennysviikko → kevyt GtG; jalkojen vahvistus illan rutiinissa.';
      if (!shoulderOk) reason += ' Olkapäätila: ei veto-/työntöliikkeitä.';
      boost = {
        title: 'Kevyt lisävoima (GtG)',
        minutes: '10–15 min (leuat pitkin päivää)',
        reason: reason,
        items: items.map((x) => Object.assign({}, x))
      };
    }

    // Sopivina päivinä: jalkojen vahvistus ILLAN ALUSSA (ennen venytyksiä), ~2–3×/vk
    const canCalf = calfDayOk(kind, s, nextKind, nextS);
    const sideStrengthOk = canCalf
      && (kind === 'easy' || kind === 'walk' || kind === 'rest' || kind === 'mobility');
    if (sideStrengthOk && pm && Array.isArray(pm.items)) {
      pm.items = pm.items.filter((x) => !x.balance && x.key !== 'calf' && x.key !== 'bridge' && x.key !== 'pm_clam');
      const strength = [
        Object.assign({}, LEGS.find((x) => x.key === 'calf') || LEGS[1]),
        Object.assign({}, LEGS.find((x) => x.key === 'bridge') || LEGS[2]),
        Object.assign({}, PM_CLAM)
      ];
      pm.items = strength.concat(pm.items);
      pm.minutes = '10–14 min';
      pm.title = 'Illan vahvistus + venyttely';
    }

    const mode = boost ? 'boost' : 'light';
    const reason = boost
      ? boost.reason
      : (noBoost || 'Tänään aamu- ja iltaliikkuvuus.');
    // items = boost-liikkeet (yhteensopivuus vanhoihin kutsuijiin) tai [] light-päivinä
    return {
      mode: mode,
      title: boost ? boost.title : 'Aamu- ja iltaliikkuvuus',
      reason: reason,
      minutes: boost ? boost.minutes : 'AM 5–8 + PM 8–12 min',
      items: boost ? boost.items : [],
      am: am,
      pm: pm,
      boost: boost,
      timing: timing
    };
  }

  // ---------- Palautuskävelyn / lepopäivän liikkuvuusosio ----------
  // Näkyy itse treenikortissa (erillään Päivärutiinista). Välttää päivän AM/PM/boost-liikkeet.
  const RECOVERY_CORE = [
    { key: 'hipflex', id: 'hip_flexor_stretch', sets: '2 × 30 s / puoli', ex: 'hip_flexor_stretch' },
    { key: 'ham', id: 'hamstring_stretch', sets: '2 × 30 s / puoli', ex: 'hamstring_stretch' },
    { key: 'calfst', id: 'calf_stretch', sets: '30–45 s suora + 30–45 s koukku / puoli', ex: 'calf_stretch' },
    { key: 'glute', id: 'figure4_stretch', sets: '2 × 30 s / puoli', ex: 'figure4_stretch' },
    { key: 'thor', id: 'thoracic_opener', sets: '8 / puoli', ex: 'thoracic_opener' },
    { key: 'catcow', id: 'cat_cow', sets: '10 hidasta', ex: 'cat_cow' }
  ];
  const RECOVERY_SUBS = [
    { key: 'wgs', id: 'worlds_greatest_stretch', sets: '5 / puoli', ex: 'worlds_greatest_stretch' },
    { key: 'quad', id: 'quad_stretch', sets: '2 × 30 s / puoli', ex: 'quad_stretch' },
    { key: 'child', id: 'childs_pose', sets: '45–60 s', ex: 'childs_pose' },
    { key: 'hipop', id: 'hip_opener', sets: '8 / puoli', ex: 'hip_opener' },
    { key: 'ankle', id: 'ankle_mobility', sets: '10 / puoli', ex: 'ankle_mobility' }
  ];
  const RECOVERY_BAL = [
    { key: 'bal1', id: 'sl_balance', sets: '2 × 30 s / jalka' },
    { key: 'bal3', id: 'tandem_stance', sets: '2 × 30 s' },
    { key: 'bal4', id: 'sl_reach', sets: '2 × 5 / jalka' },
    { key: 'bal2', id: 'sl_rdl_bw', sets: '2 × 6 / jalka' }
  ];
  const MOBILITY_TEXT = /liikkuvuu|venyt/i;

  function routineAvoidEx(routine) {
    const avoidEx = {};
    const avoidKey = {};
    function add(items) {
      (items || []).forEach((x) => {
        if (x.key) avoidKey[x.key] = true;
        (x.exs || (x.ex ? [x.ex] : [])).forEach((id) => { avoidEx[id] = true; });
      });
    }
    if (!routine) return { avoidEx: avoidEx, avoidKey: avoidKey };
    add(routine.items);
    if (routine.am) add(routine.am.items);
    if (routine.pm) add(routine.pm.items);
    if (routine.boost) add(routine.boost.items);
    return { avoidEx: avoidEx, avoidKey: avoidKey };
  }

  /**
   * Palautuskävely- tai lepopäivän ~10 min liikkuvuus + tasapaino -osio (session.mobility-muotoinen).
   * Välttää päällekkäisyydet päivän AM/PM/boost-liikkeiden kanssa.
   */
  function recoveryMobility(iso, s, routine) {
    if (!s || s.mobility || s.subtype === 'sick') return null;
    const kind = sessionKind(s);
    const text = [s.details, s.coach && s.coach.cooldown].filter(Boolean).join(' ');
    const mentions = MOBILITY_TEXT.test(text);
    if (kind !== 'walk' && !(kind === 'rest' && mentions)) return null;
    const av = routineAvoidEx(routine);
    const ex = RECOVERY_CORE.filter((x) => !av.avoidEx[x.id] && !av.avoidKey[x.key] && !av.avoidKey['pm_' + x.key.replace(/st$/, '')] && !av.avoidKey['pm_' + x.key]);
    // Prefer subs whose exercise id is not already in AM/PM
    for (let i = 0; ex.length < 6 && i < RECOVERY_SUBS.length; i++) {
      const sub = RECOVERY_SUBS[i];
      if (!av.avoidEx[sub.id] && !av.avoidKey[sub.key] && !av.avoidKey['am_' + sub.key] && !av.avoidKey['pm_' + sub.key]) {
        ex.push(sub);
      }
    }
    // If still short, fill from core/subs ignoring soft key overlaps but still avoiding exact ex id
    for (let i = 0; ex.length < 6 && i < RECOVERY_SUBS.length; i++) {
      const sub = RECOVERY_SUBS[i];
      if (!av.avoidEx[sub.id] && !ex.some((e) => e.id === sub.id)) ex.push(sub);
    }
    const n = dayNum(iso);
    const bals = RECOVERY_BAL.filter((x) => !av.avoidKey[x.key]);
    ex.push((bals.length ? bals : RECOVERY_BAL)[((n % (bals.length || 4)) + (bals.length || 4)) % (bals.length || 4)]);
    const skipped = RECOVERY_CORE.length - RECOVERY_CORE.filter((x) => !av.avoidEx[x.id]).length;
    return {
      id: 'recovery_mobility',
      label: kind === 'walk' ? 'Kävelyn jälkeen: liikkuvuus + tasapaino' : 'Liikkuvuus + tasapaino',
      durationMin: 10,
      optional: kind === 'rest',
      note: 'Rauhassa, hengitys pitkänä, ei kipua.' +
        (skipped ? ' Päivän aamu-/iltarutiinissa jo olevat liikkeet on vaihdettu muihin.' : ''),
      exercises: ex.map((x) => ({ id: x.id, sets: x.sets }))
    };
  }

  global.TreeniRoutine = {
    buildRoutine, recoveryMobility, sessionKind, nightHeavy, pullDose, dayNum,
    timingTip, calfDayOk, STRETCH, BALANCE, LEGS, UPPER, AM_POOL, PM_STRETCH, AM_ANKLE_PUMPS, PM_CLAM
  };
})(typeof window !== 'undefined' ? window : global);
