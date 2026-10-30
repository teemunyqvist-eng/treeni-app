/**
 * Päivärutiini – kevyt päivittäinen lisätreeni (grease the groove).
 * Deterministinen generaattori: päivän treenityyppi + edellinen/seuraava päivä → joko
 *  - "boost" (2–3 submaksimaalista kehonpainoliikettä, ei koskaan uupumukseen) tai
 *  - "light" (10–15 min liikkuvuus/venyttely + tasapaino).
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

  // ---------- Liikkeet ----------
  // legs: jalkaliike (ei kovaa/pitkää edeltävänä päivänä) · shoulder: kuormittaa olkapäätä
  function pullItem(iso, n) {
    const under = n % 2 === 1;
    const d = pullDose(iso);
    return {
      key: 'pull', ex: under ? 'chin_up' : 'pullup',
      name: under ? 'Leuanveto vastaotteella (GtG)' : 'Leuanveto myötäotteella (GtG)',
      dose: d.sets + ' × ' + d.reps + ' pitkin päivää',
      cue: 'Pienet sarjat pitkin päivää, ≥ 15 min välein. Lopeta sarja kun 2 toistoa jäisi vielä varaan – ei koskaan uupumukseen.',
      sets: d.sets, shoulder: true
    };
  }
  const UPPER = {
    push: { key: 'push', ex: 'push_up', name: 'Punnerrus', dose: '3 × 10', cue: 'Vartalo suorana, kyynärpäät ~45°. Jos 10. toisto hidastuu, tee 8.', shoulder: true },
    dip: { key: 'dip', ex: 'chair_dip', name: 'Dippi tuolilla', dose: '2 × 8–12', cue: 'Kyynärpäät 90°, ei syvemmälle. Hartiat alhaalla.', shoulder: true },
    core: { key: 'core', ex: 'plank', exs: ['plank', 'side_plank'], name: 'Lankku + kylkilankku', dose: '3 × 30–45 s + 2 × 20–30 s / puoli', cue: 'Pakarat ja vatsa tiukkana, lantio linjassa. Lopeta kun asento alkaa pettää.', shoulder: true }
  };
  const LEGS = [
    { key: 'bss', ex: 'bulgarian_split_squat', name: 'Bulgarialainen askelkyykky', dose: '2 × 8–10 / jalka', cue: 'Takajalka tuolille, etupolvi varpaiden suuntaan. 2–3 toistoa varaan.', legs: true },
    { key: 'calf', ex: 'calf_raise', name: 'Yhden jalan pohjenosto rappusella', dose: '2 × 15 / jalka', cue: 'Täysi liike: kanta alas venytykseen, ylös varpaille. Hitaasti alas (3 s).', legs: true },
    { key: 'bridge', ex: 'sl_glute_bridge', name: 'Yhden jalan lantionnosto', dose: '2 × 10 / jalka', cue: 'Työnnä kantapäällä, purista pakaraa ylhäällä 1–2 s, lantio vaakatasossa.', legs: true },
    { key: 'lunge', ex: 'lunge', name: 'Askelkyykky taaksepäin', dose: '2 × 10 / jalka', cue: 'Askel taakse, etupolvi nilkan päällä, rinta pystyssä.', legs: true }
  ];
  const BALANCE = [
    { key: 'bal1', ex: 'sl_balance', name: 'Yhden jalan seisonta', dose: '3 × 30 s / jalka', cue: 'Paljain jaloin, polvi pehmeänä. Helppoa? Silmät kiinni.', balance: true },
    { key: 'bal2', ex: 'sl_rdl_bw', name: 'Yhden jalan RDL ilman painoja', dose: '2 × 8 / jalka', cue: 'Kallistu lonkasta, selkä suorana, vapaa jalka taakse. Hitaasti.', balance: true },
    { key: 'bal3', ex: 'tandem_stance', name: 'Tandemseisonta', dose: '3 × 30 s', cue: 'Kantapää varpaiden eteen samalle linjalle. Eteneminen: silmät kiinni.', balance: true },
    { key: 'bal4', ex: 'sl_reach', name: 'Yhden jalan kurotus (tähti)', dose: '2 × 6 / jalka', cue: 'Kurota eteen, sivulle ja taakse – tukipolvi varpaiden linjassa.', balance: true }
  ];
  const STRETCH = [
    { key: 'hipflex', ex: 'hip_flexor_stretch', name: 'Lonkankoukistajan venytys', dose: '2 × 40 s / puoli', cue: 'Polviseisonta, purista takajalan pakaraa ja työnnä lantiota eteen – ei notkoa.' },
    { key: 'calfst', ex: 'calf_stretch', name: 'Pohje- ja akillesvenytys', dose: '2 × 30 s / puoli (suora + koukku)', cue: 'Seinää vasten: ensin takapolvi suorana, sitten koukussa (akilles/leveä kantalihas).' },
    { key: 'ham', ex: 'hamstring_stretch', name: 'Takareiden venytys', dose: '2 × 30–40 s / puoli', cue: 'Selkä suorana, kallistu lonkasta. Venytys reiden takaosaan, ei polvitaipeeseen.' },
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

  /**
   * @param {string} iso
   * @param {{session, status, prev:{session,status}, next:{session,status}, deload:boolean, shoulderRehab:boolean}} ctx
   * @returns {{mode:'boost'|'light'|'none', title, reason, minutes, items:[]}}
   */
  function buildRoutine(iso, ctx) {
    ctx = ctx || {};
    const s = ctx.session;
    const n = dayNum(iso);
    if (!s || ctx.status === 'sairas' || s.subtype === 'sick') {
      return { mode: 'none', reason: 'Sairas = lepo, ei päivärutiinia.', items: [] };
    }
    const kind = sessionKind(s);
    const prevS = ctx.prev && ctx.prev.status !== 'sairas' ? ctx.prev.session : null;
    const nextS = ctx.next ? ctx.next.session : null;
    const prevKind = sessionKind(prevS), nextKind = sessionKind(nextS);
    const forced = s.routine || (s.coach && s.coach.routine) || null;

    let light = null;
    if (kind === 'strength') light = s.subtype === 'salibandy' ? 'Salibandypäivä – tänään vain liikkuvuutta ja tasapainoa.' : 'Kuntopiiri-/voimapäivä – ei lisävoimaa, tilalle liikkuvuus ja tasapaino.';
    else if (kind === 'hard') light = 'Kova juoksupäivä – palauttava liikkuvuus riittää.';
    else if (kind === 'long') light = 'Pitkän lenkin päivä – venyttely ja liikkuvuus lenkin jälkeen.';
    else if (nightHeavy(s)) light = 'Yövuoropäivä / vähän unta – vain kevyt liikkuvuus.';
    else if (prevKind === 'long') light = 'Pitkän lenkin jälkeinen päivä – palautuminen ensin.';
    else if (prevS && prevS.subtype === 'salibandy') light = 'Salibandyn jälkeinen päivä – palautuminen ensin.';
    else if (kind === 'mobility') light = 'Lihashuoltopäivä – lisää tasapaino ja pari venytystä.';
    if (forced === 'light' && !light) light = 'Valmentaja: tänään kevyt päivärutiini.';
    if (forced === 'boost') light = null;
    if (forced === 'none') return { mode: 'none', reason: 'Valmentaja: ei päivärutiinia tänään.', items: [] };

    if (light) {
      // 4 venytystä (askel 2 → peräkkäiset päivät eri setti) + 1 tasapaino
      const st = [];
      const start = ((n % 7) + 7) % 7;
      for (let i = 0; i < 4; i++) st.push(STRETCH[(start + i * 2) % 7]);
      const bal = BALANCE[((n % 4) + 4) % 4];
      const items = kind === 'mobility' ? [bal, BALANCE[((n + 2) % 4 + 4) % 4], st[0], st[1]] : st.concat([bal]);
      return {
        mode: 'light', title: 'Liikkuvuus + tasapaino', minutes: '10–15 min', reason: light,
        items: items.map((x) => Object.assign({}, x))
      };
    }

    // Boost-päivä
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
    if (!deload || !shoulderOk) {
      if (legsOk) {
        // 5 vaihtoehtoa: 4 jalkaliikettä + tasapaino (tasapaino mukana "joskus")
        const pool = LEGS.concat([BALANCE[((n >> 1) % 4 + 4) % 4]]);
        items.push(pool[((n % 5) + 5) % 5]);
        if (!shoulderOk) items.push(LEGS[((n + 2) % 4 + 4) % 4]);
      } else {
        const b = BALANCE.filter((x) => x.key !== 'bal2');
        let pick = b[((n % 3) + 3) % 3];
        if (items.some((x) => x.key === pick.key)) pick = b[((n + 1) % 3 + 3) % 3];
        items.push(pick);
      }
    }
    let reason = 'Kevyt lisävoima: submaksimaalinen, ei koskaan uupumukseen.';
    if (!legsOk) reason += ' Huomenna kova/pitkä → ei jalkaliikkeitä tänään.';
    if (deload && shoulderOk) reason += ' Kevennysviikko → vain 2 liikettä.';
    if (!shoulderOk) reason += ' Olkapäätila: ei veto-/työntöliikkeitä.';
    return {
      mode: 'boost', title: 'Kevyt lisävoima', minutes: '10–15 min (leuat pitkin päivää)', reason,
      items: items.map((x) => Object.assign({}, x))
    };
  }

  global.TreeniRoutine = { buildRoutine, sessionKind, nightHeavy, pullDose, dayNum, STRETCH, BALANCE, LEGS, UPPER };
})(typeof window !== 'undefined' ? window : global);
