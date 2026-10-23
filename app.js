/**
 * Treeni-app – Paavo Nurmi Marathon 2027 + voima
 * localStorage-persistenssi, suomenkielinen UI
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'treeni-app-v7';
  const PREV_STORAGE_KEYS = ['treeni-app-v6', 'treeni-app-v5', 'treeni-app-v4', 'treeni-app-v3'];
  const P = TreeniPlan;
  const EX = TreeniExercises;

  const DEFAULTS = {
    settings: {
      raceName: 'Paavo Nurmi Marathon 2027',
      raceDate: '2027-08-21',
      raceLocation: 'Turku',
      fitnessLevel: 'aloittelija-keskitaso',
      strengthLocation: 'sali',
      units: 'km',
      userName: '', // käyttäjä asettaa Asetuksista (tai varmuuskopion tuonnilla)
      reminders: false,
      salibandyDow: 2, // kova joukkuelaji-ilta (ti), muutettavissa Asetuksista
      noGymCard: true, // ei salikorttia → salitreenit kotipiireinä
      marathonGoal: '',
      raceTime: ''
    },
    baseline: {
      manualWeeklyKm: null,
      manualLongestKm: null,
      restingHr: null,
      vo2max: null,
      time5k: '',
      time10k: '',
      timeHalf: '',
      yearsRunning: null,
      pullUpsStrict: null,
      pushUpsApprox: null,
      injuryNotes: ''
    },
    garmin: null, // täyttyy varmuuskopion tuonnista (vanha Garmin-yhteenveto)
    dayOverrides: {}, // iso -> { status, completed, session, note, completedAt }
    log: [],
    garminApplied: {}, // done-merkinnän id -> { date, kind } (idempotentti Garmin ✓ Valmis)
    planCache: null,
    health: {
      heightCm: null,
      weightKg: null,
      bpSys: null,
      bpDia: null,
      sleepHours: null,
      pains: [], // { id, area, side, severity, notes, status: 'active'|'history', condition }
      kneeCheck: {}, // iso -> 'ok'|'aristaa'|'kipea' (legacy; mirrored into conditionCheck.runners_knee)
      conditionCheck: {}, // iso -> { conditionId: 'ok'|'aristaa'|'kipea' }
      pendingPainFeedback: false,
      shoulderRehab: null, // olkapään kuntoutustila (paikallinen valinta); valmentajan lippu voittaa
      shoulderLog: {} // iso -> { cold1, cold2, routine }
    },
    // Kuukausiseuranta: paino + vyötärö + 1–3 progress-kuvaa / merkintä
    monthlyCheckins: []
    // Vanhat avaimet (vuorokalenteri, bannerit, univelka-asetukset)
    // säilyvät tallennetussa tilassa, mutta sovellus ei enää käytä niitä.
  };

  const BODY_AREAS = [
    'polvi', 'nilkka', 'lonkka', 'selkä', 'olkapää', 'pohje', 'akilles',
    'lonkankoukistaja', 'reisilihas', 'muu'
  ];
  const PAIN_SIDES = ['vasen', 'oikea', 'molemmat', 'keskellä'];
  const PAIN_SEVERITIES = [
    { id: 'mild', label: 'Lievä' },
    { id: 'mod', label: 'Kohtalainen' }
  ];

  let state = loadState();
  let weekOffset = 0; // 0 = current week

  // ---------- Valmentajan suunnitelma (coach-plan.json, haetaan automaattisesti) ----------
  const COACH_STORAGE_KEY = 'treeni-coach-plan';
  const COACH_URL = './coach-plan.json';
  const COACH_MIN_INTERVAL_MS = 30 * 1000;
  let coachFetchedAt = null;
  let coachLastAttempt = 0;
  let coachInflight = null;
  let coachPlan = loadCoachPlan();

  function loadCoachPlan() {
    try {
      const raw = localStorage.getItem(COACH_STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      coachFetchedAt = obj && obj.fetchedAt || null;
      return P.parseCoachPlan(obj && obj.plan);
    } catch (e) {
      return null;
    }
  }

  function storeCoachPlan(plan) {
    coachFetchedAt = new Date().toISOString();
    try {
      localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify({ plan, fetchedAt: coachFetchedAt }));
    } catch (e) { /* täynnä – käytetään muistissa olevaa */ }
  }

  /** Hakee coach-plan.json verkosta (ohittaa välimuistin). Virheessä käytetään hiljaa tallennettua. */
  function refreshCoachPlan(force) {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    const now = Date.now();
    if (coachInflight) return coachInflight;
    if (!force && now - coachLastAttempt < COACH_MIN_INTERVAL_MS) return Promise.resolve(false);
    coachLastAttempt = now;
    coachInflight = fetch(COACH_URL + '?t=' + now, { cache: 'no-store' })
      .then((res) => {
        if (!res || !res.ok) throw new Error('HTTP ' + (res && res.status));
        return res.json();
      })
      .then((json) => {
        const plan = P.parseCoachPlan(json);
        if (!plan) throw new Error('coach-plan: virheellinen muoto');
        const changed = JSON.stringify(plan) !== JSON.stringify(coachPlan);
        coachPlan = plan;
        storeCoachPlan(plan);
        const applied = applyCoachDone();
        if (changed || applied) rerenderActive();
        return changed;
      })
      .catch(() => false) // hiljaa: välimuistissa oleva suunnitelma jää käyttöön
      .then((r) => { coachInflight = null; return r; });
    return coachInflight;
  }

  // ---------- Tehdyt treenit (Garmin) → ✓ Valmis automaattisesti ----------
  /**
   * coach-plan.json "done": { pvm: [{type, km, min, pace, source, id}] }.
   * Jokainen id käsitellään kerran (state.garminApplied) → idempotentti latauksesta toiseen.
   * Jos päivän suunniteltu treeni on samaa tyyppiä → merkitään tehdyksi (kuten ✓ Valmis).
   * Jos käyttäjä merkitsi sen jo itse → ei uutta lokimerkintää, vaan Garminin todelliset km/min päivitetään.
   * Muut (esim. kävely lepopäivänä, ylimääräinen lenkki) → lokiin lisäaktiviteettina.
   */
  function applyCoachDone() {
    const done = coachPlan && coachPlan.done;
    if (!done || !P.sessionKind) return 0;
    state.garminApplied = state.garminApplied || {};
    const applied = state.garminApplied;
    const today = todayISO();
    let n = 0;
    Object.keys(done).sort().forEach((iso) => {
      if (iso > today) return;
      (done[iso] || []).forEach((e) => {
        if (!e || !e.id || applied[e.id]) return;
        let kind = 'extra';
        try { kind = applyDoneEntry(iso, e, applied); } catch (err) { if (typeof console !== 'undefined') console.error(err); }
        applied[e.id] = { date: iso, kind };
        n++;
      });
    });
    if (n) {
      const cut = P.toISO(P.addDays(new Date(), -150));
      Object.keys(applied).forEach((k) => { if (applied[k].date < cut) delete applied[k]; });
      saveState();
    }
    return n;
  }

  function insertLogSorted(entry) {
    let i = state.log.findIndex(l => (l.date || '') < entry.date);
    if (i < 0) i = state.log.length;
    state.log.splice(i, 0, entry);
    if (state.log.length > 200) state.log.length = 200;
  }

  function applyDoneEntry(iso, e, applied) {
    const day = getEffectiveDay(iso);
    const s = day && (day.session || day.planned);
    const kind = day ? P.sessionKind(s, day.status) : null;
    const garmin = e.source === 'garmin';
    const actual = { distanceKm: e.km || null, minutes: e.min || null, pace: e.pace || null, garminId: e.id, source: e.source };
    const planTaken = Object.keys(applied).some(k => applied[k].date === iso && applied[k].kind === 'plan');
    // Käsin merkitty sama treeni (✓ Valmis) → päivitetään paikallaan, ei tuplana
    const manual = state.log.find(l => l.date === iso && !l.garminId && P.logKind(l) === e.type);
    const merge = (l) => Object.assign(l, {
      distanceKm: e.km != null ? e.km : l.distanceKm, minutes: actual.minutes, pace: actual.pace,
      garminId: e.id, source: e.source, kind: e.type
    });
    if (day && s && kind === e.type && !planTaken && day.status !== 'sairas') {
      const ov = state.dayOverrides[iso] || {};
      const sess = Object.assign({}, s, e.km ? { distanceKm: e.km } : {});
      setOverride(iso, {
        completed: true,
        status: 'done',
        session: sess,
        completedAt: ov.completedAt || new Date().toISOString(),
        garmin: { id: e.id, km: actual.distanceKm, min: actual.minutes, pace: actual.pace, source: e.source }
      });
      if (manual) merge(manual);
      else insertLogSorted(Object.assign({
        date: iso, name: s.name, type: s.type, kind: e.type,
        coach: s.coach ? (s.coach.selected || 'perus') : undefined,
        at: new Date().toISOString()
      }, actual));
      return 'plan';
    }
    if (manual && (!day || !day.completed || kind !== e.type)) { merge(manual); return 'log'; }
    const T = { run: 'run', strength: 'strength', mobility: 'mobility' };
    insertLogSorted(Object.assign({
      date: iso,
      name: P.doneLabel(e.type) + (garmin ? '' : ' (käsin)'),
      type: T[e.type] || 'other', kind: e.type, extra: true,
      at: new Date().toISOString()
    }, actual));
    return 'extra';
  }

  function doneExtrasFor(iso) {
    return (state.log || []).filter(l => l.date === iso && l.extra && l.garminId);
  }

  function doneSummary(l) {
    const parts = [];
    if (l.distanceKm) parts.push(String(l.distanceKm).replace('.', ',') + ' km');
    if (l.minutes) parts.push(Math.round(l.minutes) + ' min');
    if (l.pace && (l.kind === 'run')) parts.push(l.pace + '/km');
    return parts.join(' · ');
  }

  function rerenderActive() {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const active = document.querySelector && document.querySelector('.view.active');
    if (!active) return;
    try {
      if (active.id === 'view-today') renderToday();
      else if (active.id === 'view-week') renderWeek();
      else if (active.id === 'view-progress') renderProgress();
    } catch (e) { if (typeof console !== 'undefined') console.error(e); }
  }

  // ---------- PT:n palaute (coach-plan.json "feedback") ----------
  function feedbackFor(iso) {
    const fb = coachPlan && coachPlan.feedback;
    return fb && fb[iso] ? Object.assign({ date: iso }, fb[iso]) : null;
  }

  function feedbackDateLabel(iso) {
    const t = todayISO();
    const y = P.toISO(P.addDays(P.parseISO(t), -1));
    const d = P.parseISO(iso);
    const base = P.DOW_FI[d.getDay()] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.';
    return iso === t ? 'Tänään · ' + base : iso === y ? 'Eilen · ' + base : base;
  }

  const FB_CLAMP = 220;
  function renderFeedbackCard(fb, opts) {
    if (!fb || !fb.text) return '';
    opts = opts || {};
    const long = fb.text.length > FB_CLAMP;
    return `<div class="${opts.inline ? 'pt-fb inline' : 'card pt-fb'}" data-fb-date="${esc(fb.date)}">
      <div class="pt-fb-head"><span>💬 PT:n palaute</span><span class="hint">${esc(feedbackDateLabel(fb.date))}</span></div>
      ${fb.title ? `<div class="pt-fb-title">${esc(fb.title)}</div>` : ''}
      <div class="pt-fb-text${long ? ' clamp' : ''}">${esc(fb.text)}</div>
      ${long ? '<button type="button" class="link-btn pt-fb-more">Näytä kaikki</button>' : ''}
    </div>`;
  }

  function bindFeedbackToggles(root) {
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('.pt-fb-more').forEach((b) => {
      b.onclick = (e) => {
        e.stopPropagation();
        const txt = b.parentNode.querySelector('.pt-fb-text');
        const open = txt.classList.toggle('clamp') === false;
        b.textContent = open ? 'Näytä vähemmän' : 'Näytä kaikki';
      };
    });
  }

  function coachDayFor(iso) {
    return coachPlan ? P.findCoachDay(coachPlan, iso) : null;
  }

  // ---------- Olkapään (kiertäjäkalvo) kuntoutustila ----------
  /** Valmentajan coach-plan.json flags.shoulderRehab voittaa, jos se on asetettu; muuten paikallinen valinta. */
  function shoulderRehabState() {
    const flags = (coachPlan && coachPlan.flags) || {};
    const coach = typeof flags.shoulderRehab === 'boolean' ? flags.shoulderRehab : null;
    const local = !!(state.health && state.health.shoulderRehab);
    return { active: coach !== null ? coach : local, coach, local, source: coach !== null ? 'coach' : 'local' };
  }
  function shoulderRehabActive() { return shoulderRehabState().active; }
  function setShoulderRehabLocal(on) {
    state.health.shoulderRehab = !!on;
    saveState();
  }
  function shoulderLogFor(iso) {
    const log = state.health.shoulderLog || {};
    return Object.assign({ cold1: false, cold2: false, routine: false }, log[iso] || {});
  }
  function setShoulderLog(iso, key, val) {
    state.health.shoulderLog = state.health.shoulderLog || {};
    state.health.shoulderLog[iso] = Object.assign(shoulderLogFor(iso), { [key]: !!val });
    saveState();
  }
  if (typeof window !== 'undefined') {
    window.TreeniShoulder = {
      state: () => shoulderRehabState(),
      isActive: () => shoulderRehabActive(),
      setLocal: (on) => setShoulderRehabLocal(on),
      log: (iso) => shoulderLogFor(iso),
      setLog: (iso, k, v) => setShoulderLog(iso, k, v)
    };
  }

  function formatFiDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getDate()}.${d.getMonth() + 1}. klo ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  }

  if (typeof window !== 'undefined') {
    window.TreeniCoach = {
      refresh: (force) => refreshCoachPlan(force !== false),
      getPlan: () => coachPlan,
      getEffectiveDay: (iso) => getEffectiveDay(iso),
      handleAction: (iso, act) => handleAction(iso, act)
    };
  }


  function loadState() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        for (const k of PREV_STORAGE_KEYS) {
          raw = localStorage.getItem(k);
          if (raw) break;
        }
      }
      if (!raw) return structuredClone(DEFAULTS);
      const parsed = JSON.parse(raw);
      const merged = deepMerge(structuredClone(DEFAULTS), parsed);
      migrateSettings(merged);
      // Migrate legacy free-text injury notes into pains if empty
      if ((!merged.health.pains || !merged.health.pains.length) &&
          merged.baseline && /polvi|nilkka|lonkka|selkä/i.test(merged.baseline.injuryNotes || '')) {
        // keep notes; structured pains filled manually
      }
      return merged;
    } catch (e) {
      return structuredClone(DEFAULTS);
    }
  }

  /**
   * Kertamigraatio: vanha versio tallensi oletukseksi salibandy = perjantai (5),
   * joka jäi puhelimen tallennukseen. Salibandy on tiistaisin → korjaa kerran.
   * Käyttäjän myöhempi oma valinta Asetuksista säilyy (salibandyFix = 1).
   */
  function migrateSettings(st) {
    if (!st || !st.settings) return;
    const s = st.settings;
    if (!s.salibandyFix) {
      const d = s.salibandyDow;
      if (d === 5 || d === '5' || d === 'none' || d === null || d === undefined || d === '') {
        s.salibandyDow = 2;
        st.planCache = null;
      }
      s.salibandyFix = 1;
    }
    if (s.noGymCard === undefined) s.noGymCard = true;
  }

  function deepMerge(base, over) {
    for (const k of Object.keys(over || {})) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) {
        base[k] = deepMerge(base[k] || {}, over[k]);
      } else {
        base[k] = over[k];
      }
    }
    return base;
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Tallennus epäonnistui (localStorage täynnä?)');
    }
  }

  function structuredClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // ---------- Varmuuskopio (vienti / tuonti JSON) ----------
  const BACKUP_APP_ID = 'treeni-app';
  const BACKUP_FORMAT = 1;

  function buildBackup() {
    const data = structuredClone(state);
    delete data.planCache; // johdettu, luodaan uudelleen tuonnissa
    return {
      app: BACKUP_APP_ID,
      format: BACKUP_FORMAT,
      storageKey: STORAGE_KEY,
      exportedAt: new Date().toISOString(),
      data
    };
  }

  function backupJson() {
    return JSON.stringify(buildBackup(), null, 2);
  }

  /** Jäsentää varmuuskopion (kääre tai pelkkä tila-objekti). Heittää virheen jos ei kelpaa. */
  function parseBackup(text) {
    let obj;
    try {
      obj = typeof text === 'string' ? JSON.parse(text) : text;
    } catch (e) {
      throw new Error('Ei kelvollista JSONia');
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Tiedosto ei ole varmuuskopio');
    if (obj.app && obj.app !== BACKUP_APP_ID) throw new Error('Varmuuskopio on toisesta sovelluksesta');
    if (obj.format && +obj.format > BACKUP_FORMAT) throw new Error('Varmuuskopion versio on uudempi kuin sovellus');
    const data = obj.data && typeof obj.data === 'object' ? obj.data : obj;
    const known = Object.keys(DEFAULTS);
    const keys = Object.keys(data).filter(k => known.includes(k));
    if (!keys.length) throw new Error('Varmuuskopiossa ei ole tunnistettavia tietoja');
    const clean = {};
    keys.forEach(k => { clean[k] = data[k]; });
    return clean;
  }

  /**
   * Tuo varmuuskopio. Jokainen tiedostossa oleva osio (settings, baseline, garmin, log…)
   * korvaa nykyisen osion kokonaan; puuttuvat osiot jäävät ennalleen.
   */
  function importBackup(text) {
    const data = parseBackup(text);
    const next = structuredClone(state);
    Object.keys(data).forEach(k => {
      const v = data[k];
      const def = DEFAULTS[k];
      if (k === 'health' && v && typeof v === 'object' && !Array.isArray(v)) {
        // Terveystiedot yhdistetään: tiedostossa olevat kentät päivittyvät, muut (kivut ym.) säilyvät
        next.health = deepMerge(deepMerge(structuredClone(DEFAULTS.health), state.health || {}), structuredClone(v));
        return;
      }
      if (k === 'monthlyCheckins' && Array.isArray(v)) {
        // Kuukausimerkinnät yhdistetään (sama id tai päivä → tiedoston versio)
        const incoming = v.filter(e => e && e.date).map(e => (TP ? TP.normalizeEntry(e) : e));
        const keep = (Array.isArray(state.monthlyCheckins) ? state.monthlyCheckins : [])
          .filter(e => !incoming.some(n => n.id === e.id || n.date === e.date));
        next.monthlyCheckins = keep.concat(incoming);
        return;
      }
      if (def && typeof def === 'object' && !Array.isArray(def) && v && typeof v === 'object' && !Array.isArray(v)) {
        next[k] = deepMerge(structuredClone(def), v);
      } else {
        next[k] = structuredClone(v);
      }
    });
    next.planCache = null;
    migrateSettings(next);
    state = next;
    if (TP && state.monthlyCheckins && state.monthlyCheckins.length) {
      const w = TP.sortEntriesDesc(state.monthlyCheckins).find(e => e.weightKg != null);
      if (w) state.health.weightKg = w.weightKg;
    }
    state.planCache = buildPlan();
    saveState();
    return Object.keys(data);
  }

  if (typeof window !== 'undefined') {
    window.TreeniBackup = {
      buildBackup: () => buildBackup(),
      backupJson: () => backupJson(),
      parseBackup,
      importBackup,
      getState: () => state
    };
  }

  function garminForPlan() {
    const g = {};
    if (state.garmin && state.garmin.summary) {
      g.avgWeeklyKm = state.garmin.summary.avgWeeklyKm;
      g.longestRunKm = state.garmin.summary.longestRunKm;
    }
    if (state.baseline.manualWeeklyKm) g.manualWeeklyKm = +state.baseline.manualWeeklyKm;
    if (state.baseline.manualLongestKm) g.manualLongestKm = +state.baseline.manualLongestKm;
    return g;
  }

  function noGym() { return state.settings.noGymCard !== false; }

  /** Suunnitelman asetukset: ilman salikorttia voima oletuksena kotona. */
  function planSettings() {
    return noGym() ? Object.assign({}, state.settings, { strengthLocation: 'koti' }) : state.settings;
  }

  function buildPlan() {
    const plan = P.generatePlan(planSettings(), garminForPlan());
    plan.salibandyDow = state.settings.salibandyDow;
    plan.noGym = noGym();
    return plan;
  }

  function ensurePlan(force) {
    const need =
      force ||
      !state.planCache ||
      state.planCache.salibandyDow !== state.settings.salibandyDow ||
      state.planCache.noGym !== noGym() ||
      state.planCache.raceDate !== state.settings.raceDate ||
      !planCoversToday(state.planCache) ||
      !planHasWarmup(state.planCache) ||
      !planHasGym60(state.planCache);
    if (need) {
      state.planCache = buildPlan();
      saveState();
    }
    return state.planCache;
  }

  /** Vanha välimuisti 45 min salon voima → regeneroi 60 min */
  function planHasGym60(plan) {
    if (!plan || !plan.weeks) return false;
    for (const w of plan.weeks) {
      for (const d of w.days) {
        const s = d.planned;
        if (s && s.type === 'strength' && s.location === 'sali' && !s.modified) {
          return (s.durationMin || 0) >= 60;
        }
      }
    }
    return true;
  }

  function planCoversToday(plan) {
    if (!plan || !plan.weeks || !plan.weeks.length) return false;
    const today = P.toISO(new Date());
    const first = plan.weeks[0].weekStart;
    // regenerate if today is before first week start (shouldn't) or >7 days past last covered
    const lastWeek = plan.weeks[plan.weeks.length - 1];
    const lastDay = lastWeek.days[6].date;
    return today >= first && today <= lastDay;
  }

  /** Vanha välimuisti ilman lämmittelylohkoja → regeneroi */
  function planHasWarmup(plan) {
    if (!plan || !plan.weeks) return false;
    for (const w of plan.weeks) {
      for (const d of w.days) {
        const s = d.planned;
        if (s && (s.type === 'run' || s.type === 'strength')) {
          return !!(s.warmup && s.warmup.exercises && s.warmup.exercises.length);
        }
      }
    }
    return true;
  }

  function todayISO() {
    return P.toISO(new Date());
  }

  function getEffectiveDay(iso) {
    const plan = ensurePlan();
    const found = P.getDayFromPlan(plan, iso);
    if (!found) return null;
    let override = state.dayOverrides[iso] || {};
    let planned = found.day.planned;
    const coachDay = coachDayFor(iso);
    let coachSession = null;
    if (coachDay) {
      coachSession = P.coachDayToSession(coachDay, coachPlan);
      planned = coachSession;
      // Vanha muokkaus (ennen valmentajan päivitystä) ei peitä uutta valmentajan treeniä.
      const fresh = override.completed || override.coachKey === coachSession.coach.key;
      if (!fresh && (override.session || override.status)) {
        override = override.status === 'sairas'
          ? { status: 'sairas', session: P.applySick(coachSession), note: override.note }
          : {};
      }
    }
    let session = override.session || planned;
    // Auto-soften if active pain and session not already pain-modified by user override
    if (session && !override.session && P.applyPainSoftening) {
      const ansMap = answersForDay(iso);
      const softened = P.applyPainSoftening(session, state.health.pains, ansMap);
      if (softened && softened.painSoftened) session = softened;
    }
    // Ei salikorttia: salitreenit (automaattinen, valmentajan, vaihdettu) → vastaava kotipiiri
    if (session && noGym() && P.noGymSession) {
      session = P.noGymSession(session, found.day.weekIndex);
    }
    // Olkapäätila: suodata kaikki sessiot (automaattinen, valmentajan, vaihdettu, kevennetty/kovennettu)
    const shoulder = shoulderRehabActive();
    if (session && shoulder && P.applyShoulderRehab) {
      session = P.applyShoulderRehab(session, EX);
    }
    return {
      ...found.day,
      planned,
      autoPlanned: found.day.planned,
      coach: !!coachSession,
      session,
      status: override.status || null,
      completed: !!override.completed,
      note: override.note || '',
      completedAt: override.completedAt || null,
      garmin: override.garmin || null,
      shoulderRehab: shoulder,
      week: found.week
    };
  }

  function activePains() {
    return (state.health.pains || []).filter(p => p.status === 'active');
  }

  /** Today's condition answers: merge legacy kneeCheck into conditionCheck.runners_knee */
  function answersForDay(iso) {
    const map = Object.assign({}, (state.health.conditionCheck || {})[iso] || {});
    const legacy = (state.health.kneeCheck || {})[iso];
    if (legacy && !map.runners_knee) map.runners_knee = legacy;
    return map;
  }

  function setConditionAnswer(iso, conditionId, ans) {
    state.health.conditionCheck = state.health.conditionCheck || {};
    state.health.conditionCheck[iso] = Object.assign({}, state.health.conditionCheck[iso] || {}, { [conditionId]: ans });
    if (conditionId === 'runners_knee') {
      state.health.kneeCheck = state.health.kneeCheck || {};
      state.health.kneeCheck[iso] = ans;
    }
  }

  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function setOverride(iso, patch) {
    const cd = coachDayFor(iso);
    if (cd) {
      patch = Object.assign({}, patch, { coachKey: P.coachKey(cd) });
    }
    state.dayOverrides[iso] = Object.assign({}, state.dayOverrides[iso] || {}, patch);
    saveState();
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ---------- Takaisin-nappi (History API) ----------
  // Jokainen avoin ikkuna = yksi historiamerkintä {treeni:1, view, modal:taso}. Välilehti (≠ Tänään)
  // = yksi merkintä Tänään-merkinnän päällä. Takaisin sulkee ylimmän ikkunan / palaa Tänään-näkymään;
  // Tänään-näkymässä ilman ikkunoita takaisin poistuu normaalisti. Omat history.go()-kutsut jonotetaan,
  // jotta pushState ei osu kesken siirtymän eikä popstate sulje mitään toiseen kertaan.
  const H = (typeof history !== 'undefined' && history && typeof history.pushState === 'function') ? history : null;
  const nav = { pending: 0, queue: [], timer: null };
  let currentView = 'today';
  let modalLevels = 0;
  const modalStack = [];

  function navFlush() {
    while (nav.pending === 0 && nav.queue.length) {
      const fn = nav.queue.shift();
      try { fn(); } catch (e) { console.error(e); }
    }
  }
  function navMutate(fn) {
    if (!H) return;
    if (nav.pending > 0) nav.queue.push(fn); else fn();
  }
  function navBackRaw(n) {
    if (!H || !n) return;
    nav.pending++;
    clearTimeout(nav.timer);
    nav.timer = setTimeout(() => { if (nav.pending) { nav.pending = 0; navFlush(); } }, 1000);
    H.go(-n);
  }
  function navBack(n) { navMutate(() => navBackRaw(n)); }
  function navState() {
    const s = H && H.state;
    return s && s.treeni ? s : { treeni: 1, view: 'today', modal: 0 };
  }
  function navPopstate(e) {
    if (nav.pending > 0) {
      nav.pending--;
      if (!nav.pending) { clearTimeout(nav.timer); navFlush(); }
      return;
    }
    const s = (e && e.state && e.state.treeni) ? e.state : { view: 'today', modal: 0 };
    while (modalLevels > (s.modal || 0)) closeModalTopUI();
    const v = s.view || 'today';
    if (v !== currentView) renderView(v);
  }

  // ---------- Views ----------
  function showView(name) {
    renderView(name);
    navMutate(() => {
      const s = navState();
      if ((s.modal || 0) > 0) { H.replaceState(Object.assign({}, s, { view: name }), ''); return; }
      if (name === 'today') { if (s.view && s.view !== 'today') navBackRaw(1); }
      else if (!s.view || s.view === 'today') H.pushState({ treeni: 1, view: name, modal: 0 }, '');
      else H.replaceState({ treeni: 1, view: name, modal: 0 }, '');
    });
  }

  function renderView(name) {
    currentView = name;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.getAttribute('data-view') === name));
    const view = document.getElementById('view-' + name);
    if (view) view.classList.add('active');
    if (typeof window !== 'undefined' && window.scrollTo) window.scrollTo(0, 0);
    if (name === 'today') renderToday();
    if (name === 'week') renderWeek();
    if (name === 'exercises') renderExerciseLibrary();
    if (name === 'progress') renderProgress();
    if (name === 'settings') renderSettings();
  }

  function updateHeader() {
    const plan = ensurePlan();
    const today = getEffectiveDay(todayISO());
    const phase = today ? today.phaseName : (plan.weeks[0] && plan.weeks[0].phaseName) || '';
    document.getElementById('header-sub').textContent =
      state.settings.raceName + ' · ' + formatFiDate(state.settings.raceDate) +
      (state.settings.marathonGoal ? ' · tavoite ' + state.settings.marathonGoal : '');
    const pill = document.getElementById('phase-pill');
    const weeksLeft = Math.ceil(
      P.daysBetween(new Date(), P.parseISO(state.settings.raceDate)) / 7
    );
    pill.textContent = phase + (weeksLeft > 0 ? ` · ${weeksLeft} vk kisaan` : ' · kisaviikko');
  }

  function formatFiDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  function renderDoneExtras(iso) {
    const ex = doneExtrasFor(iso);
    if (!ex.length) return '';
    return `<div class="card done-extra"><div class="hint">Myös tehty tänään</div>${ex.map(l =>
      `<div class="done-extra-row"><span class="badge done garmin">Garmin ✓</span> <strong>${esc(l.name)}</strong> <span class="hint">${esc(doneSummary(l))}</span></div>`).join('')}</div>`;
  }

  function sessionBadges(day) {
    const s = day.session || day.planned;
    if (!s) return '';
    let html = '';
    if (s.type === 'run') html += '<span class="badge run">Juoksu</span>';
    if (s.type === 'strength') html += '<span class="badge strength">Voima</span>';
    if (s.type === 'rest') html += '<span class="badge rest">Lepo</span>';
    if (s.type === 'mobility' || s.subtype === 'lihashuolto') html += '<span class="badge mobility">Lihashuolto</span>';
    if (s.type === 'other') {
      const labels = { kavely: 'Kävely', pyoraily: 'Pyöräily', uinti: 'Uinti', salibandy: 'Salibandy', muu: 'Muu' };
      const lab = labels[s.subtype] || (s.lightLoad ? 'Kevyt liikunta' : 'Liikunta');
      html += `<span class="badge other">${esc(lab)}</span>`;
      if (s.lightLoad) html += '<span class="badge mod">Kevyt</span>';
    }
    if (s.type === 'race') html += '<span class="badge run">Kisa</span>';
    if (s.coach) html += '<span class="badge coach">Valmentajalta</span>';
    if (day.completed) html += day.garmin && day.garmin.source === 'garmin'
      ? '<span class="badge done garmin">Garmin ✓</span>' : '<span class="badge done">Tehty</span>';
    if (day.status === 'sairas') html += '<span class="badge skip">Sairas</span>';
    if (day.status === 'salibandy' || s.salibandyDay || s.modified === 'salibandy')
      html += '<span class="badge salibandy">Salibandy</span>';
    if (s.modified && s.modified !== 'salibandy') html += '<span class="badge mod">Muokattu</span>';
    if (s.distanceKm && !(s.type === 'other' && s.lightLoad)) html += `<span class="badge">${s.distanceKm} km</span>`;
    if (s.durationMin && (s.type === 'strength' || s.type === 'mobility' || s.type === 'other')) html += `<span class="badge">~${s.durationMin} min</span>`;
    if (s.location === 'sali' || s.location === 'koti') html += `<span class="badge">${s.location === 'sali' ? 'Sali' : 'Koti'}</span>`;
    if (s.painSoftened) html += '<span class="badge warn-pain">Kipu huomioitu</span>';
    if (s.shoulderRehab && (s.type === 'strength' || s.type === 'mobility')) html += '<span class="badge warn-pain">Olkapää huomioitu</span>';
    if (s.preferCrossTrain) html += '<span class="badge warn-pain">Pyörä/krossi</span>';
    return html;
  }


  function renderExList(exercises, opts) {
    opts = opts || {};
    if (!exercises || !exercises.length) {
      if (opts.editable) {
        return '<ul class="ex-list editable"></ul>';
      }
      return '';
    }
    let html = '<ul class="ex-list' + (opts.optional ? ' optional' : '') + (opts.editable ? ' editable' : '') + '">';
    exercises.forEach((ex, idx) => {
      const lib = EX.getExercise(ex.id);
      const name = (lib && lib.name) || ex.label || ex.id;
      if (opts.editable) {
        html += `<li class="ex-row" data-ex-idx="${idx}">
          <button type="button" class="ex-item" data-ex="${esc(ex.id)}">
            <span><span class="ex-name">${esc(name)}</span>
            ${ex.alt ? `<div class="ex-alt">tai: ${esc(ex.alt)}</div>` : ''}
            </span>
            <span class="ex-sets">${esc(ex.sets || '')}</span>
            <span class="ex-chevron">›</span>
          </button>
          <div class="ex-row-actions">
            <button type="button" class="btn sm ghost ex-act" data-ex-act="vaihda" data-ex-idx="${idx}">Vaihda</button>
            <button type="button" class="btn sm ghost danger-text ex-act" data-ex-act="poista" data-ex-idx="${idx}">Poista</button>
          </div>
        </li>`;
      } else {
        html += `<li><button type="button" class="ex-item" data-ex="${esc(ex.id)}">
          <span><span class="ex-name">${esc(name)}</span>
          ${ex.alt ? `<div class="ex-alt">tai: ${esc(ex.alt)}</div>` : ''}
          </span>
          <span class="ex-sets">${esc(ex.sets || '')}</span>
          <span class="ex-chevron">›</span>
        </button></li>`;
        if (ex.altId) {
          html += `<li><button type="button" class="ex-item" data-ex="${esc(ex.altId)}" style="opacity:0.85">
            <span><span class="ex-name">${esc((EX.getExercise(ex.altId) || {}).name || ex.alt || ex.altId)}</span>
            <div class="ex-alt">vaihtoehto</div></span>
            <span class="ex-sets">${esc(ex.sets || '')}</span>
            <span class="ex-chevron">›</span>
          </button></li>`;
        }
      }
    });
    html += '</ul>';
    return html;
  }

  function renderPrepBlock(block, kind) {
    if (!block || !block.exercises || !block.exercises.length) return '';
    const optional = !!block.optional;
    const title = block.label || (kind === 'warmup' ? 'Lämmittely' : 'Liikkuvuus');
    const dur = block.durationMin ? ` · ~${block.durationMin} min` : '';
    let badge = '';
    if (kind === 'warmup') {
      badge = '<span class="badge warmup">Lämmittely</span>';
    } else if (kind === 'rehab') {
      badge = '<span class="badge rehab">Olkapää</span>';
    } else if (optional) {
      badge = '<span class="badge optional">Vapaaehtoinen</span>';
    }
    const teeMyos = optional && block.teeMyos
      ? '<div class="block-kicker">Tee myös <span class="hint-inline">(voit ohittaa)</span></div>'
      : '';
    let html = `<div class="session-block${optional ? ' is-optional' : (kind === 'rehab' ? ' is-rehab' : ' is-warmup')}">`;
    html += `<div class="block-head"><div class="block-title">${esc(title)}${esc(dur)}</div><div class="block-badges">${badge}</div></div>`;
    html += teeMyos;
    if (block.note) html += `<div class="hint" style="margin-bottom:8px">${esc(block.note)}</div>`;
    if (optional) {
      html += `<details class="optional-details"${kind === 'mobility' && block.id === 'mobility_gentle' ? ' open' : ''}>`;
      html += `<summary>Näytä liikkeet</summary>`;
      html += renderExList(block.exercises, { optional: true });
      html += `</details>`;
    } else {
      html += renderExList(block.exercises);
    }
    html += '</div>';
    return html;
  }

  function renderSessionBody(s, opts) {
    opts = opts || {};
    if (!s) return '';
    let html = '';
    // Warm-up first (run + strength)
    if (s.warmup) html += renderPrepBlock(s.warmup, 'warmup');

    const canEdit = !!opts.editable && !s.coach && (s.type === 'strength' || s.type === 'mobility');
    if (s.coach && !(s.exercises && s.exercises.length)) {
      html += renderCoachBlock(s, opts);
    } else if ((s.type === 'strength' || s.type === 'mobility') && ((s.exercises && s.exercises.length) || canEdit)) {
      html += '<div class="session-block is-main">';
      html += '<div class="block-head"><div class="block-title">' + (s.type === 'mobility' ? 'Liikkuvuus &amp; venyttely' : 'Päätreeni') + '</div></div>';
      if (s.equipmentNote) {
        html += `<div class="hint" style="margin-bottom:8px">${esc(s.equipmentNote)}</div>`;
      }
      if (s.headline) {
        html += `<div class="session-desc">${esc(s.headline)}</div>`;
      }
      html += renderExList(s.exercises || [], { editable: canEdit });
      if (canEdit) {
        html += '<button type="button" class="btn sm block" style="margin-top:10px" data-ex-act="lisaa">+ Lisää liike</button>';
      }
      const notes = [s.restNote, s.notes].filter(Boolean).join(' ');
      if (notes) html += `<div class="session-notes">${esc(notes)}</div>`;
      html += '<div class="hint" style="margin-top:8px">Napauta liikettä nähdäksesi tekniikan, hyödyt ja videon.' +
        (canEdit ? ' Voit poistaa, vaihtaa tai lisätä liikkeitä – tallentuu päivän muokkauksiin.' : '') + '</div>';
      html += '</div>';
    } else if (s.type === 'other') {
      html += '<div class="session-block is-main">';
      html += `<div class="session-details">${esc(s.details || '')}</div>`;
      if (s.lightLoad) {
        html += '<div class="hint" style="margin-top:8px">Kevyt aktiivisuus – ei lasketa kovaksi juoksuksi viikkovolyymeihin.</div>';
      }
      html += '</div>';
    } else {
      // Running / rest / race details
      html += '<div class="session-block is-main">';
      if (s.type !== 'rest' || !(s.mobility && s.details)) {
        html += `<div class="session-details">${esc(s.details || '')}</div>`;
      } else {
        html += `<div class="session-details">${esc(s.details || '')}</div>`;
      }
      if (s.cueIds && s.cueIds.length) {
        html += '<div class="cue-chip-row">';
        s.cueIds.forEach((id) => {
          const lib = EX.getExercise(id);
          if (!lib) return;
          html += `<button type="button" class="cue-chip" data-ex="${esc(id)}">${esc(lib.name)}</button>`;
        });
        html += '</div>';
      }
      html += '</div>';
    }

    if (s.shoulderNote) html += `<div class="alert warn shoulder-note">🩹 ${esc(s.shoulderNote)}</div>`;
    if (s.rehabBlock) html += renderPrepBlock(s.rehabBlock, 'rehab');
    // Optional mobility / cooldown / gentle
    if (s.mobility) html += renderPrepBlock(s.mobility, 'mobility');
    return html;
  }

  function renderCoachBlock(s, opts) {
    const c = s.coach || {};
    let html = '<div class="session-block is-main coach-block">';
    html += '<div class="block-head"><div class="block-title">🧭 Valmentajalta</div>' +
      (c.selected ? `<div class="block-badges"><span class="badge mod">${esc(c.selected)}</span></div>` : '') + '</div>';
    if (c.warmup) html += `<div class="coach-sub"><strong>Lämmittely:</strong> ${esc(c.warmup)}</div>`;
    html += `<div class="session-details">${esc(s.details || '')}</div>`;
    if (c.cooldown) html += `<div class="coach-sub"><strong>Lopuksi:</strong> ${esc(c.cooldown)}</div>`;
    if (c.options && c.options.length) {
      html += '<div class="section-title">Vaihtoehdot</div><ul class="coach-options">';
      c.options.forEach((o, i) => {
        const btn = opts && opts.coachActions
          ? ` <button type="button" class="btn sm" data-act="coach-opt-${i}">Valitse</button>` : '';
        html += `<li><strong>${esc(o.label)}:</strong> ${esc(o.details || '')}${btn}</li>`;
      });
      html += '</ul>';
      if (opts && opts.coachActions && (c.selected || s.modified)) {
        html += '<button type="button" class="btn sm ghost" data-act="coach-reset">↺ Valmentajan alkuperäinen</button>';
      }
    }
    if (c.note) html += `<div class="session-notes coach-note">💬 ${esc(c.note)}</div>`;
    const upd = formatFiDateTime(c.updatedAt);
    if (upd) html += `<div class="hint coach-updated">Päivitetty ${esc(upd)}</div>`;
    html += '</div>';
    return html;
  }

  function bindExerciseTaps(root) {
    if (!root) return;
    root.querySelectorAll('[data-ex]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openExerciseDetail(btn.getAttribute('data-ex'));
      });
    });
  }

  function bullets(arr) {
    if (!arr || !arr.length) return '<p class="hint">—</p>';
    return '<ul>' + arr.map((x) => `<li>${esc(x)}</li>`).join('') + '</ul>';
  }

  function openExerciseDetail(id) {
    const ex = EX.getExercise(id);
    if (!ex) {
      toast('Liikettä ei löytynyt');
      return;
    }
    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const embed = EX.embedUrl(ex);
    const ext = EX.externalUrl(ex);
    let videoHtml = '';
    if (online && embed) {
      videoHtml = `
        <div class="ex-video-wrap">
          <iframe
            src="${esc(embed)}"
            title="${esc(ex.name)}"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
            loading="lazy"
            referrerpolicy="strict-origin-when-cross-origin"></iframe>
        </div>
        <p class="ex-video-note">Ulkoinen demovideo (YouTube). Ei kuulu sovelluksen offline-sisältöön. ${ex.video.label ? esc(ex.video.label) + '.' : ''}</p>
        ${ext ? `<a class="btn sm block" style="margin-top:8px;text-align:center" href="${esc(ext)}" target="_blank" rel="noopener noreferrer">Avaa YouTubessa</a>` : ''}`;
    } else if (ext) {
      videoHtml = `
        <div class="alert info">${online ? 'Upotusta ei ole tälle liikkeelle – avaa ulkoinen video.' : 'Olet offline: videot eivät ole saatavilla. Tekniikkavihjeet alla.'}</div>
        ${online ? `<a class="btn primary block" style="text-align:center" href="${esc(ext)}" target="_blank" rel="noopener noreferrer">${esc(ex.video.label || 'Katso video')}</a>` : ''}
        <p class="ex-video-note">Videot ovat ulkoisia demoja (YouTube), eivät sovelluksen omia.</p>`;
    } else {
      videoHtml = '<div class="alert warn">Videolinkkiä ei ole saatavilla tälle liikkeelle.</div>';
    }

    const tags = (ex.equipment || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('');
    const catMap = { juoksu: 'Juoksu', voima: 'Voima', liikkuvuus: 'Liikkuvuus' };
    const cat = catMap[ex.category] || ex.category;
    const catBadge = ex.category === 'juoksu' ? 'run' : (ex.category === 'liikkuvuus' ? 'warmup' : 'strength');

    openModal(
      ex.name,
      `<div class="session-meta"><span class="badge ${catBadge}">${cat}</span>${tags}</div>
       ${ex.rehab === 'shoulder' ? '<div class="alert info">🩹 Olkapään kuntoutusliike: kevyt kuorma, 2–3×10–15. <strong>Tee vain kivuttomalla alueella.</strong></div>' : ''}
       ${ex.loadsShoulder ? `<div class="alert warn">⚠ Kuormittaa olkapäätä${shoulderRehabActive() ? ' – ei käytössä olkapään kuntoutustilassa.' : '.'}</div>` : ''}
       <div class="ex-detail-section"><h3>Hyödyt</h3>${bullets(ex.benefits)}</div>
       <div class="ex-detail-section"><h3>Tekniikkavihjeet</h3>${bullets(ex.cues)}</div>
       <div class="ex-detail-section"><h3>Yleiset virheet</h3>${bullets(ex.mistakes)}</div>
       <div class="ex-detail-section"><h3>Video</h3>${videoHtml}</div>`
    );
  }

  let exLibFilter = 'kaikki';

  function renderExerciseLibrary() {
    updateHeader();
    const el = document.getElementById('exercises-content');
    const all = EX.listExercises();
    const filtered = exLibFilter === 'kaikki' ? all
      : exLibFilter === 'olkapaa' ? all.filter((e) => e.rehab === 'shoulder')
      : all.filter((e) => e.category === exLibFilter);
    const shoulderOn = shoulderRehabActive();
    const voima = all.filter((e) => e.category === 'voima').length;
    const juoksu = all.filter((e) => e.category === 'juoksu').length;
    const liikk = all.filter((e) => e.category === 'liikkuvuus').length;
    const catLabel = { juoksu: 'Juoksu', voima: 'Voima', liikkuvuus: 'Liikkuvuus' };

    el.innerHTML = `
      <div class="card">
        <h2>Liikekirjasto</h2>
        <p class="session-desc" style="margin:0">Tekniikka, hyödyt ja videot (${all.length} liikettä: ${voima} voima, ${juoksu} juoksu, ${liikk} liikkuvuus).</p>
        <div class="ex-library-filters" style="margin-top:12px">
          <button class="btn sm${exLibFilter==='kaikki'?' active':''}" data-filter="kaikki">Kaikki</button>
          <button class="btn sm${exLibFilter==='voima'?' active':''}" data-filter="voima">Voima</button>
          <button class="btn sm${exLibFilter==='juoksu'?' active':''}" data-filter="juoksu">Juoksu</button>
          <button class="btn sm${exLibFilter==='liikkuvuus'?' active':''}" data-filter="liikkuvuus">Liikkuvuus</button>
          <button class="btn sm${exLibFilter==='olkapaa'?' active':''}" data-filter="olkapaa">🩹 Olkapää</button>
        </div>
        <div class="alert info" style="margin-top:8px;margin-bottom:0">Videot ovat ulkoisia YouTube-demoja. Offline-tilassa näet silti vihjeet.</div>
      </div>
      ${filtered.map((e) => {
        const hasEmbed = e.video && e.video.type === 'embed';
        return `<div class="ex-lib-card" data-ex="${esc(e.id)}">
          <h3>${esc(e.name)}</h3>
          <div class="meta">${catLabel[e.category] || e.category}
            · ${(e.equipment || []).length ? esc(e.equipment.join(', ')) : 'ei välineitä'}
            · ${hasEmbed ? 'upotus' : 'ulkoinen linkki'}</div>
          ${e.rehab === 'shoulder' ? '<div class="meta rehab-meta">🩹 Olkapään kuntoutus · vain kivuttomalla alueella</div>' : ''}
          ${shoulderOn && e.loadsShoulder ? '<div class="meta warn-meta">⚠ Kuormittaa olkapäätä – ei olkapäätilassa</div>' : ''}
        </div>`;
      }).join('')}
    `;
    el.querySelectorAll('[data-filter]').forEach((btn) => {
      btn.onclick = () => { exLibFilter = btn.getAttribute('data-filter'); renderExerciseLibrary(); };
    });
    bindExerciseTaps(el);
  }


  // ---------- App usage tips + rotating motivation (Today) ----------
  const APP_USAGE_TIPS = [
    {
      title: 'Valmentajan suunnitelma',
      body: 'Valmentajan päivät (🧭 Valmentajalta) haetaan automaattisesti, kun avaat sovelluksen tai yhteys palaa. Ne korvaavat automaattisen treenin. Muut päivät tulevat varasuunnitelmasta.'
    },
    {
      title: 'Valmis · Kevennä · Kovenna',
      body: '✓ Valmis kirjaa treenin. Kevennä/Kovenna käyttää valmentajan kevennettyä/kovennettua versiota, jos sellainen on – muuten kuormaa säädetään ~30 % / 10–15 %.'
    },
    {
      title: 'Vaihda treeni',
      body: 'Juoksu · Sali · Koti · Lihashuolto · Kävely · Muu laji vaihtavat päivän tyypin. Muu tilanne -kohdasta: sairas (= lepo), salibandy (huominen kevyeksi), siirrä tai lyhyt versio.'
    },
    {
      title: 'Olkapään kuntoutustila',
      body: 'Kun tila on päällä (Asetukset → Kivut tai valmentajan asetus), olkapäätä kuormittavat liikkeet korvataan jalka-/keskivartaloliikkeillä ja voimapäiviin lisätään kevyt olkapääblokki. Tänään-kortissa: kylmähoito 2× ja 10 min rutiini.'
    },
    {
      title: 'Liikkeet',
      body: 'Napauta liikettä: tekniikka, hyödyt, virheet ja video. Lämmittely ja liikkuvuus näkyvät treenin yhteydessä. Kotivoimassa 🎙 ääniohjaus.'
    },
    {
      title: 'Varmuuskopio',
      body: 'Asetukset → Vie JSON tallentaa kaikki tiedot tiedostoksi. Tuo JSON palauttaa ne – myös uudelle laitteelle. Tee vienti säännöllisesti.'
    }
  ];

  // Goggins-tyylinen kyykytys: kova tekosyille ja mukavuudenhalulle, ei koskaan
  // kehoa/perhettä/identiteettiä kohtaan. Terveys ensin: sairaus = lepo, kipu = kevennä.
  const MOTIVATION_LINES = [
    'Stay hard.',
    'Kiltteys on paskaa. Lenkkarit jalkaan.',
    "Who's gonna carry the boats? Et ainakaan sinä sohvalta.",
    'Sulla on enemmän tekosyitä kuin kilometrejä. Korjataan se tänään.',
    'Kisa on 21.8.2027 Turussa. Jokainen tämän päivän tekosyy maksetaan siellä korkojen kanssa.',
    '32 km kohdalla Turussa seinä ei kysy, olitko vuorossa. Se kysyy, teitkö työt.',
    'Mitä vittua sä vielä selaat? Treeni on tuossa alla.',
    'Vuorotyö? Joo, rankkaa. Tee silti se lyhyt versio. Kukaan ei tule pelastamaan sua.',
    'Syysloma ei ole loma tavoitteesta. Löydä se puoli tuntia – se on siellä.',
    'Kaljat odottaa. Treeni ei. Järjestys on selvä.',
    'Sohva ei ole koskaan juossut ketään alle neljän tunnin.',
    'Alle 4 h ei tule toivomalla. Se tulee tekemällä silloinkin, kun ei vittu huvita.',
    'Puolikas meni? Kiva. Nyt matka tuplataan – ja kiva ei riitä.',
    'Mukavuudenhaluinen mieli neuvottelee aina. Älä kuuntele sitä paskaa.',
    'Motivaatio on paskaa. Kuri on se, joka kantaa maaliin.',
    'Älä neuvottele. Avaa treeni, tee työ, paina Valmis.',
    'Mieli huutaa "riittää" 40 %:n kohdalla. Sulla on vielä 60 % jäljellä.',
    'Kukaan ei välitä siitä, miltä susta tuntuu. Välitä siitä, mitä teet.',
    'Ei kukaan kanna sun veneitä. Kanna ne itse.',
    'Huomenna on paskin mahdollinen päivä aloittaa. Tänään on parempi.',
    'Useimmiten et ole loppu. Olet vain tottunut helppoon. Tee lyhyt versio ja katso.',
    'Sade? Pimeä? Tervetuloa Suomeen. Juokse.',
    'Tee se, mitä sun mukavuudenhaluinen versio vihaa eniten.',
    'Jokainen skipattu treeni on lupaus, jonka rikoit itsellesi. Lopeta lupausten rikkominen.',
    'Lyhyt tehty treeni voittaa täydellisen suunnitelman, jota et koskaan tee.',
    'Yövuoron jälkeen ei kovaa laatua – se on fiksua, ei pehmeää. Mutta 20 min kävely? Ei tekosyitä.',
    'Maratonin viimeinen kymppi juostaan nyt, näinä paskoina arki-iltoina.',
    'Stay hard. Ei siksi, että on kivaa – vaan koska kukaan muu ei tee sitä sun puolesta.',
    'Lopeta fiiliksen odottaminen. Fiilis tulee liikkeessä, ei sohvalla.',
    'Kirjoita tekosyy ylös. Lue se ääneen. Kuulostaako hyvältä? Ei. Lähde.',
    'Turun 32 km seinä on jo olemassa. Tänään rakennat joko tikkaat tai lisää tiiliä.',
    'Mitä vittua "ehkä huomenna" tarkoittaa? Ei mitään. Tänään.',
    'Kipu nivelessä = kevennä. Laiskuus päässä = ei mitään kevennettävää.',
    'Väsymys on tieto, ei käsky. Tee se, mikä tänään on mahdollista – ja tee se kunnolla.',
    'Callus your mind. Kovetu päästä, jalat seuraa.',
    'Sun läheiset näkee, mitä teet – ei sitä, mitä lupaat. Näytä esimerkkiä.'
  ];

  // Tilannekohtaiset poolit
  const MOTIVATION_DONE = [
    'Tehty. Hyvä. Älä ala taputtaa itseäsi selkään – huomenna sama uudestaan.',
    'Yksi vene kannettu. Turussa odottaa koko laivasto.',
    'Ansaittu. Nyt palautuminen yhtä tosissaan kuin treeni: syö, juo, nuku.',
    'Tänään tekosyy hävisi. Muista miltä se tuntui, kun se seuraavan kerran yrittää.',
    'Hyvä työ. Ei kehuja enempää – ne tekee pehmeäksi. Stay hard.',
    'Merkitty. Laita tämä päivä talteen – 32 km kohdalla kaivat sen esiin.',
    'Tämä oli se treeni, jonka mukavuudenhaluinen mieli halusi skipata. Et antanut. Hyvä.',
    'Valmis. Paskat fiiliksistä – teit sen silti. Sitä se on.'
  ];
  const MOTIVATION_EASED = [
    'Kevennys on taktiikka, ei lupa luovuttaa. Tee kevyt versio kunnolla.',
    'Kevyempi päivä ei tarkoita puolivillaista. Täysi keskittyminen, pienempi kuorma.',
    'Fiksu kevennys tänään = kova treeni ensi viikolla. Tyhmä sankarointi = sohva kuukaudeksi.',
    'Kevennetty ei tarkoita skipattua. Tee se.',
    'Jos jokin oikeasti sattuu, kevennä – se on järkeä. Jos vain huvittaa jättää väliin, se on tekosyy.',
    'Deload ei ole loma. Se on osa suunnitelmaa – noudata sitä yhtä kurinalaisesti kuin kovia päiviä.',
    'Pienempi kuorma, sama asenne. Stay hard myös kevyenä päivänä.'
  ];
  const MOTIVATION_SICK = [
    'Sairas = lepo. Piste. Tämä ei ole tekosyy, tämä on suunnitelma.',
    'Kova ei ole se, joka treenaa kuumeessa. Kova on se, joka lepää kunnolla ja palaa terveenä.',
    'Älä esitä sankaria. Kipeänä treenaavat sankarit makaa sängyssä kaksi viikkoa lisää. Lepää.',
    'Tänään sun ainoa tehtävä on parantua. Tee se yhtä tosissaan kuin intervallit.',
    'Ei treeniä, ei syyllisyyttä, ei paskaa. Lepo on tänään se kova valinta.',
    'Lepää, juo, nuku. Paluu kevyesti vasta kun oireet on poissa – ei päivääkään aiemmin.'
  ];
  const MOTIVATION_REST = [
    'Lepopäivä on osa treeniä. Nuku, syö kunnolla – ja huomenna ei tekosyitä.',
    'Lepo ei tarkoita kaljoja ja sohvaa koko iltaa. Palautuminen on työtä.',
    'Tänään ladataan. Huomenna kannetaan veneitä taas.',
    'Lepää kuin tarkoittaisit sitä. Huomenna ei kysytä, oliko kiva.'
  ];

  function motivationForDay(iso, pool) {
    // Stable rotation by calendar day (not random flicker on re-render)
    const lines = (pool && pool.length) ? pool : MOTIVATION_LINES;
    let h = 0;
    const s = String(iso || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return lines[h % lines.length];
  }

  function motivationContext(day) {
    if (!day) return 'default';
    const s = day.session || day.planned || {};
    if (day.status === 'sairas' || s.subtype === 'sick') return 'sick';
    if (day.completed) return 'done';
    if (s.type === 'rest') return 'rest';
    if (day.status === 'keventa' || day.status === 'ei-fiilista' || day.deload ||
        s.salibandyRecovery || s.modified === 'keventa' || s.painSoftened) return 'eased';
    return 'default';
  }

  function renderAppTipsHtml() {
    const items = APP_USAGE_TIPS.map(t =>
      `<li><strong>${esc(t.title)}.</strong> ${esc(t.body)}</li>`
    ).join('');
    return `<ul class="tip-bullets app-tip-list">${items}</ul>`;
  }

  function renderMotivationLine(iso, day) {
    const ctx = motivationContext(day);
    const pools = { done: MOTIVATION_DONE, eased: MOTIVATION_EASED, sick: MOTIVATION_SICK, rest: MOTIVATION_REST };
    const line = motivationForDay(iso, pools[ctx]);
    return `<div class="moti-card moti-${ctx}" role="status"><p class="moti-text">${esc(line)}</p></div>`;
  }

  function renderToday() {
    updateHeader();
    const iso = todayISO();
    let day = getEffectiveDay(iso);
    const el = document.getElementById('today-content');
    if (!day) {
      el.innerHTML = '<div class="card empty">Ei suunnitelmaa tälle päivälle. Tarkista kilpailupäivä asetuksista.</div>';
      return;
    }
    let s = day.session || day.planned;
    const dow = day.dowLabel;
    const pains = activePains();
    const ansMap = answersForDay(iso);
    const tipConds = P.allTipCards ? P.allTipCards(state.health.pains) : [];
    const promptConds = (P.conditionsNeedingPrompt ? P.conditionsNeedingPrompt(pains) : []);
    const yIso = P.toISO(P.addDays(P.parseISO(iso), -1));

    // Eilen salibandy → tämän päivän palautus (ellei jo tehty)
    const yOv = state.dayOverrides[yIso];
    if (yOv && yOv.status === 'salibandy' && !day.completed &&
        !(state.dayOverrides[iso] && state.dayOverrides[iso].note === 'Palautus salibandyn jälkeen')) {
      const cur = day.session || day.planned;
      if (cur && !cur.salibandyRecovery && (cur.type === 'run' || cur.type === 'strength')) {
        applySalibandyNextDayRecovery(yIso);
        const refreshed = getEffectiveDay(iso);
        if (refreshed) {
          s = refreshed.session || refreshed.planned;
          day = refreshed;
        }
      }
    }

    let guidance = '';
    if (day.status === 'sairas') {
      guidance = '<div class="alert warn">Sairas = lepo. Ei treeniä, ei korvausta, ei syyllisyyttä.</div>';
    } else if (day.completed) {
      guidance = '<div class="alert ok">✓ Tehty. Huomenna lasketaan taas nollasta.</div>';
    }
    if (s && s.salibandyRecovery && !day.completed) {
      guidance += '<div class="alert info">🏒 Palautuspäivä salibandyn jälkeen – pidä kevyenä.</div>';
    }
    if (pains.length) {
      const labels = pains.map(p => {
        const sev = p.severity === 'mod' ? 'kohtalainen' : 'lievä';
        return `${p.area}${p.side ? ' (' + p.side + ')' : ''} · ${sev}`;
      }).join(', ');
      guidance += `<div class="alert warn">Aktiiviset kivut: ${esc(labels)}</div>`;
    }

    let condPromptsHtml = '';
    if (promptConds.length && !day.completed && day.status !== 'sairas') {
      condPromptsHtml = promptConds.map(c => {
        const ans = ansMap[c.id] || null;
        return `<div class="card knee-check condition-check" data-cond="${esc(c.id)}">
          <h2>${esc(c.promptTitle)}</h2>
          <div class="status-grid three">
            <button class="status-btn${ans==='ok'?' primary':''}" data-cond-ans="ok" data-cond-id="${esc(c.id)}">OK</button>
            <button class="status-btn warn${ans==='aristaa'?' primary':''}" data-cond-ans="aristaa" data-cond-id="${esc(c.id)}">Aristää</button>
            <button class="status-btn danger${ans==='kipea'?' primary':''}" data-cond-ans="kipea" data-cond-id="${esc(c.id)}">Kipeä</button>
          </div>
        </div>`;
      }).join('');
    }

    let tipCardsHtml = '';
    if (tipConds.length) {
      tipCardsHtml = `<details class="card today-fold-card">
        <summary class="today-fold-sum"><span>Kipuohjeet</span><span class="hint">${tipConds.length} kpl</span></summary>
        ${tipConds.map(tip => `<div class="tip-block">
          <h3>${esc(tip.title)}</h3>
          <ul class="tip-bullets">${tip.bullets.map(b => '<li>' + esc(b) + '</li>').join('')}</ul>
          <div class="cue-chip-row">${tip.exerciseIds.map(id => {
            const lib = EX.getExercise(id);
            return lib ? `<button type="button" class="cue-chip" data-ex="${esc(id)}">${esc(lib.name)}</button>` : '';
          }).join('')}</div>
        </div>`).join('')}
      </details>`;
    }

    const voiceBtn = (s.type === 'strength' && s.location === 'koti' && s.exercises && s.exercises.length && !day.completed)
      ? '<button class="btn block" data-act="voice-coach" style="margin-top:10px">🎙 Ääniohjattu treeni</button>'
      : '';

    let shoulderCard = '';
    if (day.shoulderRehab) {
      const lg = shoulderLogFor(iso);
      const shs = shoulderRehabState();
      const chk = (key, label) =>
        `<label class="sh-check${lg[key] ? ' on' : ''}"><input type="checkbox" data-sh="${key}"${lg[key] ? ' checked' : ''} /> ${label}</label>`;
      shoulderCard = `<div class="card shoulder-card" id="shoulder-card">
        <div class="shoulder-title">🩹 Olkapää (oikea kiertäjäkalvo) – kuntoutustila${shs.source === 'coach' ? ' <span class="badge coach">valmentajalta</span>' : ''}</div>
        <p class="shoulder-text">Olkapää: kylmä 15 min 2×/pv · kevyet heilurit ja liikeradat ilman kipua</p>
        <div class="sh-checks">
          ${chk('cold1', '❄️ Kylmä 1')}
          ${chk('cold2', '❄️ Kylmä 2')}
          ${chk('routine', '✓ Rutiini')}
        </div>
        <button type="button" class="btn block" id="sh-routine-btn">10 min olkapäärutiini ›</button>
      </div>`;
      if (s && (s.salibandyDay || s.subtype === 'salibandy') && !day.completed) {
        guidance += '<div class="alert warn">🩹 Salibandy: mailankäsittely ja kaatumiset kuormittavat olkapäätä – pelaa vain, jos olkapää on kivuton.</div>';
      }
    }

    const swapBtn = (act, ico, label, active) =>
      `<button type="button" class="swap-btn${active ? ' active' : ''}" data-act="${act}"><span class="swap-ico">${ico}</span><span class="swap-label">${label}</span></button>`;

    el.innerHTML = `
      ${renderMotivationLine(iso, day)}
      ${shoulderCard}
      <div class="card today-main${day.completed ? ' is-done' : ''}">
        <div class="today-date">Tänään · ${dow} ${formatFiDate(iso)}</div>
        <div class="session-title today-title">${esc(s.name)}</div>
        <div class="session-meta">${sessionBadges(day)}</div>
        ${guidance}
        ${renderSessionBody(s, { editable: !day.completed && !s.coach && (s.type === 'strength' || s.type === 'mobility'), coachActions: !day.completed })}
        ${voiceBtn}

        <button class="btn primary block done-btn" data-act="done"${day.completed ? ' disabled' : ''}>${day.completed ? '✓ Tehty' : '✓ Valmis'}</button>
        <div class="status-grid two">
          <button class="status-btn" data-act="keventa">↓ Kevennä</button>
          <button class="status-btn" data-act="koventa">↑ Kovenna</button>
        </div>

        <details class="today-fold">
          <summary class="today-fold-sum"><span>Vaihda treeni</span><span class="hint">${noGym() ? 'koti' : 'sali · koti'} · juoksu · muu</span></summary>
          <div class="swap-grid" role="group" aria-label="Vaihda treenityyppi">
            ${swapBtn('swap-juoksu', '🏃', 'Juoksu', s.type === 'run' || s.type === 'race')}
            ${noGym() ? '' : swapBtn('swap-sali', '🏋️', 'Sali', s.type === 'strength' && s.location === 'sali')}
            ${swapBtn('swap-koti', '🏠', 'Koti', s.type === 'strength' && s.location === 'koti')}
            ${swapBtn('swap-lihashuolto', '🧘', 'Lihashuolto', s.type === 'mobility' || s.subtype === 'lihashuolto')}
            ${swapBtn('swap-kavely', '🚶', 'Kävely', s.type === 'other' && s.subtype === 'kavely')}
            ${swapBtn('swap-muu', '✨', 'Muu laji', s.type === 'other' && s.subtype !== 'kavely' && s.subtype !== 'salibandy')}
          </div>
        </details>

        <details class="today-fold">
          <summary class="today-fold-sum"><span>Muu tilanne</span><span class="hint">sairas · salibandy · siirrä</span></summary>
          <div class="status-grid two">
            <button class="status-btn danger" data-act="sairas">🤒 Sairas</button>
            <button class="status-btn salibandy" data-act="salibandy">🏒 Salibandy</button>
            <button class="status-btn" data-act="siirra">Siirrä päivälle…</button>
            <button class="status-btn" data-act="lyhyt">Lyhyt versio</button>
          </div>
        </details>
      </div>
      ${renderDoneExtras(iso)}
      ${renderFeedbackCard(feedbackFor(iso) || feedbackFor(yIso))}
      ${condPromptsHtml}
      ${tipCardsHtml}
    `;
    bindFeedbackToggles(el);

    el.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(iso, btn.getAttribute('data-act')));
    });
    el.querySelectorAll('[data-sh]').forEach(cb => {
      cb.addEventListener('change', () => {
        setShoulderLog(iso, cb.getAttribute('data-sh'), cb.checked);
        rerenderActive();
      });
    });
    const shBtn = el.querySelector('#sh-routine-btn');
    if (shBtn) shBtn.addEventListener('click', () => openShoulderRoutineModal(iso));
    el.querySelectorAll('[data-cond-ans]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ans = btn.getAttribute('data-cond-ans');
        const cid = btn.getAttribute('data-cond-id');
        setConditionAnswer(iso, cid, ans);
        const base = day.planned;
        const map = answersForDay(iso);
        const allOk = (P.conditionsNeedingPrompt(activePains()) || []).every(c => map[c.id] === 'ok');
        const next = allOk
          ? structuredClone(base)
          : P.applyPainSoftening(base, state.health.pains, map);
        const prevStatus = (state.dayOverrides[iso] && state.dayOverrides[iso].status) || null;
        setOverride(iso, { session: next, status: prevStatus });
        saveState();
        const label = (P.CONDITIONS[cid] && P.CONDITIONS[cid].label) || 'Kipu';
        toast(ans === 'ok' ? (label + ' OK – treeni normaalisti') :
          ans === 'aristaa' ? (label + ' aristaa – kuormaa kevennetty') : (label + ' kipeä – suosi kevennystä / krossia'));
        rerenderActive();
      });
    });
    bindExerciseTaps(el);
    bindExerciseEdit(el, iso);
  }

  function esc(t) {
    return String(t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applySessionTypeSwap(iso, day, kind, extraOpts) {
    extraOpts = extraOpts || {};
    const plan = ensurePlan();
    const fitness = (plan && plan.fitness) || P.fitnessBaseline(state.settings.fitnessLevel || 'keskitaso', state.garmin);
    const current = day.session || day.planned;
    let session = P.swapSessionType(kind, {
      weekIndex: typeof day.weekIndex === 'number' ? day.weekIndex : 0,
      phaseId: day.phase || (day.week && day.week.phase) || 'base',
      fitness: fitness,
      currentSession: current,
      deload: !!day.deload,
      customName: extraOpts.customName
    });
    if (!session) return;
    // Säilytä kipulogikka: pehmennä jos aktiivisia kipuja / vastauksia (ei muu-liikuntaan)
    if (session.type !== 'other' && P.applyPainSoftening) {
      const map = answersForDay(iso);
      const softened = P.applyPainSoftening(session, state.health.pains, map);
      if (softened) session = softened;
    }
    const status = kind === 'salibandy' ? 'salibandy' : 'tyyppi';
    setOverride(iso, { session, status, completed: false, note: session.type === 'other' ? session.name : undefined });
    if (kind === 'salibandy') applySalibandyNextDayRecovery(iso);
    saveState();
    const labels = {
      koti: 'Kotivoima', sali: 'Salivoima', juoksu: 'Juoksu', lihashuolto: 'Lihashuolto',
      kavely: 'Kävely', pyoraily: 'Pyöräily', uinti: 'Uinti', salibandy: 'Salibandy', muu: session.name || 'Muu'
    };
    toast('Vaihdettu: ' + (labels[kind] || kind));
    rerenderActive();
  }

  function handleAction(iso, act) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    let session = day.session || day.planned;

    if (act === 'done') {
      setOverride(iso, {
        completed: true,
        status: 'done',
        session,
        completedAt: new Date().toISOString()
      });
      state.log.unshift({
        date: iso,
        name: session.name,
        type: session.type,
        distanceKm: session.distanceKm || null,
        kind: P.sessionKind ? (P.sessionKind(session, day.status) || undefined) : undefined,
        coach: session.coach ? (session.coach.selected || 'perus') : undefined,
        at: new Date().toISOString()
      });
      if (state.log.length > 200) state.log.length = 200;
      if (activePains().length) {
        state.health.pendingPainFeedback = true;
      }
      saveState();
      toast('Tehty. Yksi vene kannettu.');
      rerenderActive();
      if (state.health.pendingPainFeedback) {
        setTimeout(() => openPainFeedbackModal(iso), 400);
      }
      return;
    }

    if (act === 'voice-coach') {
      openVoiceCoach(iso);
      return;
    }

    if (act === 'sairas') {
      session = P.applySick(session);
      setOverride(iso, { status: 'sairas', session, completed: false, note: 'Sairas' });
      toast('Lepo merkitty – parane kunnolla, ei sankarointia');
      rerenderActive();
      return;
    }

    if (act.indexOf('coach-opt-') === 0) {
      const base = day.planned && day.planned.coach ? day.planned : session;
      const chosen = P.applyCoachOption(base, +act.slice('coach-opt-'.length));
      if (chosen) {
        setOverride(iso, { status: chosen.modified === 'keventa' ? 'keventa' : chosen.modified === 'koventa' ? 'koventa' : 'coach-option', session: chosen, completed: false });
        toast('Valittu: ' + chosen.coach.selected);
        rerenderActive();
      }
      return;
    }

    if (act === 'coach-reset') {
      if (day.planned && day.planned.coach) {
        setOverride(iso, { status: null, session: day.planned, completed: false });
        toast('Valmentajan alkuperäinen treeni');
        rerenderActive();
      }
      return;
    }

    if ((act === 'keventa' || act === 'koventa') && day.planned && day.planned.coach && session && session.coach && !session.coach.selected) {
      const idx = P.coachOptionIndex(day.planned, act === 'keventa' ? /kevenn/i : /kovenn/i);
      if (idx >= 0) {
        const chosen = P.applyCoachOption(day.planned, idx);
        setOverride(iso, { status: act, session: chosen });
        toast(act === 'keventa' ? 'Valmentajan kevennetty versio – taktiikka, ei luovutus' : 'Valmentajan kovennettu versio');
        rerenderActive();
        return;
      }
    }

    if (act === 'keventa') {
      session = P.applyKeventa(session);
      setOverride(iso, { status: 'keventa', session });
      toast('Kevennetty ≈30 % – taktiikka, ei luovutus');
      rerenderActive();
      return;
    }

    if (act === 'koventa') {
      session = P.applyKoventa(session);
      if (session.modified === 'koventa-blocked') {
        setOverride(iso, { session });
        toast('Tätä treeniä ei kovenneta – jo vaativa');
      } else {
        setOverride(iso, { status: 'koventa', session });
        toast('Hieman kovennettu (+10–15 %)');
      }
      rerenderActive();
      return;
    }

    if (act === 'swap-loc') {
      // Taaksepäin yhteensopiva: sali ↔ koti
      session = P.swapLocation(session);
      setOverride(iso, { session, status: day.status || 'sijainti' });
      toast(session.location === 'koti' ? 'Vaihdettu kotitreeniksi' : 'Vaihdettu salitreeniksi');
      rerenderActive();
      return;
    }

    if (act === 'swap-koti' || act === 'swap-sali' || act === 'swap-juoksu' || act === 'swap-lihashuolto' ||
        act === 'swap-kavely' || act === 'swap-pyoraily' || act === 'swap-uinti') {
      applySessionTypeSwap(iso, day, act.replace('swap-', ''));
      return;
    }

    if (act === 'swap-muu') {
      openMuuActivityModal(iso, day);
      return;
    }

    if (act === 'siirra') {
      openRescheduleModal(iso);
      return;
    }

    if (act === 'lyhyt') {
      session = P.applyShortSwap(session);
      setOverride(iso, { status: 'lyhyt', session });
      toast('Korvattu lyhyellä 20–30 min versiolla');
      rerenderActive();
      return;
    }

    if (act === 'salibandy') {
      session = P.applySalibandy(session);
      setOverride(iso, {
        status: 'salibandy',
        session,
        note: 'Salibandy / kova kuorma',
        completed: session.type === 'rest' || session.subtype === 'salibandy' ? false : !!day.completed
      });
      applySalibandyNextDayRecovery(iso);
      toast('Salibandy merkitty – huominen palautuspäivä');
      rerenderActive();
      return;
    }

  }

  /** Salibandyn jälkeinen päivä → automaattinen palautus (juoksu + voima) */
  function applySalibandyNextDayRecovery(saliIso) {
    const tomorrow = P.toISO(P.addDays(P.parseISO(saliIso), 1));
    const tom = getEffectiveDay(tomorrow);
    if (!tom) return;
    const ts = tom.session || tom.planned;
    if (!ts) return;
    // Älä ylikirjoita jos käyttäjä jo merkinnyt valmiiksi / sairas
    const ov = state.dayOverrides[tomorrow];
    if (ov && (ov.completed || ov.status === 'sairas')) return;
    const needs =
      ts.type === 'run' ||
      ts.type === 'strength' ||
      (ts.type === 'rest' && !ts.salibandyRecovery);
    if (!needs) return;
    // Soften even easy runs slightly; always convert quality/long/strength
    const hardRun = ts.type === 'run' &&
      (ts.subtype === 'tempo' || ts.subtype === 'intervals' ||
       ts.subtype === 'strides' || ts.subtype === 'long' || ts.subtype === 'easy');
    const hardStr = ts.type === 'strength';
    if (hardRun || hardStr || ts.type === 'rest') {
      const recovered = P.applySalibandyRecovery(ts);
      setOverride(tomorrow, {
        session: recovered,
        status: 'keventa',
        note: 'Palautus salibandyn jälkeen'
      });
    }
  }

  function openPainFeedbackModal(iso) {
    state.health.pendingPainFeedback = false;
    saveState();
    const pains = activePains();
    if (!pains.length) return;
    const labels = pains.map(p => p.area + (p.side ? ' (' + p.side + ')' : '')).join(', ');
    openModal(
      'Miten kipu treenin jälkeen?',
      `<p>Aktiiviset: <strong>${esc(labels)}</strong></p>
       <div class="action-row" style="flex-direction:column">
         <button class="btn primary block" id="pf-ok">Parempi / OK</button>
         <button class="btn block" id="pf-same">Sama kuin ennen</button>
         <button class="btn block" id="pf-worse">Paheni</button>
       </div>`,
      (root) => {
        const finish = (msg, patchPain) => {
          if (patchPain) {
            state.health.pains = state.health.pains.map(p => {
              if (p.status !== 'active') return p;
              return Object.assign({}, p, patchPain(p));
            });
            saveState();
          }
          closeModal();
          toast(msg);
          rerenderActive();
        };
        root.querySelector('#pf-ok').onclick = () => finish('Kiva kuulla – jatka kuormanhallintaa');
        root.querySelector('#pf-same').onclick = () => finish('Merkitty – pidä kevennys tarvittaessa');
        root.querySelector('#pf-worse').onclick = () => finish('Paheni – kevennä seuraavia päiviä', (p) => ({
          severity: 'mod',
          notes: ((p.notes || '') + ' | paheni treenin jälkeen ' + iso).trim()
        }));
      }
    );
  }

  let coachState = null;

  function speakFi(text, opts) {
    opts = opts || {};
    try {
      if (typeof speechSynthesis === 'undefined') return false;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'fi-FI';
      u.rate = opts.rate || 1;
      const voices = speechSynthesis.getVoices();
      const fi = voices.find(v => /fi/i.test(v.lang));
      if (fi) u.voice = fi;
      speechSynthesis.speak(u);
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopCoachTimers() {
    if (coachState && coachState.timerId) {
      clearInterval(coachState.timerId);
      coachState.timerId = null;
    }
  }

  function buildCoachPlaylist(session) {
    const items = [];
    function pushBlock(block, kind) {
      if (!block || !block.exercises) return;
      block.exercises.forEach((ex) => {
        const lib = EX.getExercise(ex.id);
        items.push({
          id: ex.id,
          name: (lib && lib.name) || ex.label || ex.id,
          sets: ex.sets || '',
          kind,
          workSec: kind === 'warmup' ? 40 : (kind === 'mobility' ? 45 : 75),
          restSec: kind === 'mobility' ? 20 : 50,
          lib
        });
      });
    }
    pushBlock(session.warmup, 'warmup');
    pushBlock({ exercises: session.exercises }, 'main');
    if (session.rehabBlock) pushBlock(session.rehabBlock, 'mobility');
    if (session.mobility) pushBlock(session.mobility, 'mobility');
    return items;
  }

  function openVoiceCoach(iso) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    const session = day.session || day.planned;
    if (!session || session.type !== 'strength' || session.location !== 'koti') {
      toast('Ääniohjaus on kotivoimatreeneille');
      return;
    }
    const playlist = buildCoachPlaylist(session);
    if (!playlist.length) {
      toast('Ei liikkeitä ääniohjaukseen');
      return;
    }
    const speechOk = typeof speechSynthesis !== 'undefined';
    coachState = {
      iso, playlist, idx: 0, phase: 'ready',
      remaining: 0, timerId: null, paused: false, speechOk
    };

    openModal(
      'Ääniohjattu treeni',
      `<div id="coach-root" class="coach-root">
        <div class="alert info" style="margin-bottom:10px">
          ${speechOk
            ? 'Suomenkieliset puhevihjeet (Web Speech). Timer toimii offline; video tarvitsee verkon.'
            : 'Puhesynteesi ei ole saatavilla tällä laitteella – timer ja video toimivat silti.'}
        </div>
        <div class="coach-video" id="coach-video"></div>
        <div class="coach-now">
          <div class="hint" id="coach-kind">—</div>
          <div class="coach-name" id="coach-name">Valmis aloittamaan</div>
          <div class="coach-sets" id="coach-sets"></div>
          <div class="coach-timer" id="coach-timer">—</div>
          <div class="hint" id="coach-phase"></div>
        </div>
        <div class="coach-progress hint" id="coach-progress"></div>
        <div class="action-row" style="flex-direction:column;margin-top:12px">
          <button class="btn primary block" id="coach-start">Aloita</button>
          <button class="btn block" id="coach-pause" disabled>Tauko</button>
          <button class="btn block" id="coach-skip" disabled>Ohita liike</button>
          <button class="btn ghost block" id="coach-stop">Lopeta</button>
        </div>
      </div>`,
      (root) => {
        const modal = document.getElementById('modal');
        modal.classList.add('coach-modal');
        root.querySelector('#coach-start').onclick = () => coachStart();
        root.querySelector('#coach-pause').onclick = () => coachTogglePause();
        root.querySelector('#coach-skip').onclick = () => coachSkip();
        root.querySelector('#coach-stop').onclick = () => {
          coachCleanup();
          closeModal();
          modal.classList.remove('coach-modal');
        };
        const origClose = document.getElementById('modal-x');
        if (origClose) {
          origClose.addEventListener('click', () => {
            coachCleanup();
            modal.classList.remove('coach-modal');
          });
        }
        renderCoachUI();
      }
    );
  }

  function coachCleanup() {
    stopCoachTimers();
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) {}
    coachState = null;
  }

  function renderCoachUI() {
    if (!coachState) return;
    const nameEl = document.getElementById('coach-name');
    const setsEl = document.getElementById('coach-sets');
    const timerEl = document.getElementById('coach-timer');
    const phaseEl = document.getElementById('coach-phase');
    const kindEl = document.getElementById('coach-kind');
    const progEl = document.getElementById('coach-progress');
    const videoEl = document.getElementById('coach-video');
    if (!nameEl) return;

    const item = coachState.playlist[coachState.idx];
    const total = coachState.playlist.length;
    progEl.textContent = item
      ? `Liike ${coachState.idx + 1} / ${total}`
      : `Valmis · ${total} liikettä`;

    if (!item) {
      nameEl.textContent = 'Treeni valmis!';
      setsEl.textContent = '';
      timerEl.textContent = '✓';
      phaseEl.textContent = '';
      kindEl.textContent = '';
      videoEl.innerHTML = '';
      return;
    }

    const kindLabel = { warmup: 'Lämmittely', main: 'Päätreeni', mobility: 'Liikkuvuus' }[item.kind] || '';
    kindEl.textContent = kindLabel;
    nameEl.textContent = item.name;
    setsEl.textContent = item.sets || '';

    if (coachState.phase === 'ready') {
      timerEl.textContent = '—';
      phaseEl.textContent = 'Paina Aloita';
    } else if (coachState.phase === 'work') {
      timerEl.textContent = formatCoachTime(coachState.remaining);
      phaseEl.textContent = coachState.paused ? 'Tauolla (suoritus)' : 'Suorita';
    } else if (coachState.phase === 'rest') {
      timerEl.textContent = formatCoachTime(coachState.remaining);
      phaseEl.textContent = coachState.paused ? 'Tauolla (lepo)' : 'Lepo';
    }

    const online = typeof navigator === 'undefined' || navigator.onLine !== false;
    const embed = item.lib ? EX.embedUrl(item.lib) : null;
    const ext = item.lib ? EX.externalUrl(item.lib) : null;
    if (online && embed) {
      const cur = videoEl.getAttribute('data-ex');
      if (cur !== item.id) {
        videoEl.setAttribute('data-ex', item.id);
        videoEl.innerHTML = `<iframe src="${esc(embed)}" title="${esc(item.name)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
      }
    } else if (ext && online) {
      videoEl.setAttribute('data-ex', item.id);
      videoEl.innerHTML = `<a class="btn sm block" href="${esc(ext)}" target="_blank" rel="noopener">Avaa video: ${esc(item.name)}</a>`;
    } else {
      videoEl.innerHTML = '<div class="hint">Video ei saatavilla (offline tai ei linkkiä). Timer + ohjeet toimivat.</div>';
    }

    const startBtn = document.getElementById('coach-start');
    const pauseBtn = document.getElementById('coach-pause');
    const skipBtn = document.getElementById('coach-skip');
    if (startBtn) startBtn.disabled = coachState.phase !== 'ready' && coachState.phase !== 'done';
    if (pauseBtn) {
      pauseBtn.disabled = coachState.phase !== 'work' && coachState.phase !== 'rest';
      pauseBtn.textContent = coachState.paused ? 'Jatka' : 'Tauko';
    }
    if (skipBtn) skipBtn.disabled = !item || coachState.phase === 'ready';
  }

  function formatCoachTime(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return (m > 0 ? m + ':' : '') + String(r).padStart(m > 0 ? 2 : 1, '0') + (m > 0 ? '' : ' s');
  }

  function coachStart() {
    if (!coachState) return;
    coachState.paused = false;
    coachBeginWork();
  }

  function coachBeginWork() {
    if (!coachState) return;
    const item = coachState.playlist[coachState.idx];
    if (!item) {
      coachState.phase = 'done';
      speakFi('Treeni valmis. Hyvä. Huomenna uudestaan.');
      renderCoachUI();
      const startBtn = document.getElementById('coach-start');
      if (startBtn) { startBtn.disabled = true; startBtn.textContent = 'Valmis'; }
      return;
    }
    coachState.phase = 'work';
    coachState.remaining = item.workSec;
    const cue = `Seuraava: ${item.name}. ${item.sets ? item.sets + '.' : ''} Aloita.`;
    speakFi(cue);
    renderCoachUI();
    stopCoachTimers();
    coachState.timerId = setInterval(() => coachTick(), 1000);
  }

  function coachBeginRest() {
    if (!coachState) return;
    const item = coachState.playlist[coachState.idx];
    coachState.phase = 'rest';
    coachState.remaining = (item && item.restSec) || 45;
    speakFi(`Lepo. ${coachState.remaining} sekuntia.`);
    renderCoachUI();
  }

  function coachTick() {
    if (!coachState || coachState.paused) return;
    coachState.remaining -= 1;
    if (coachState.remaining === 30 || coachState.remaining === 10) {
      speakFi(coachState.remaining + ' sekuntia.');
    }
    if (coachState.remaining <= 0) {
      if (coachState.phase === 'work') {
        coachBeginRest();
      } else if (coachState.phase === 'rest') {
        coachState.idx += 1;
        coachBeginWork();
      }
      return;
    }
    renderCoachUI();
  }

  function coachTogglePause() {
    if (!coachState) return;
    coachState.paused = !coachState.paused;
    if (coachState.paused) {
      try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch (e) {}
      speakFi('Tauko.');
    } else {
      speakFi('Jatketaan.');
    }
    renderCoachUI();
  }

  function coachSkip() {
    if (!coachState) return;
    coachState.idx += 1;
    coachState.paused = false;
    speakFi('Ohitetaan.');
    coachBeginWork();
  }

  function openShoulderRoutineModal(iso) {
    const lg = shoulderLogFor(iso);
    openModal('Olkapäärutiini ~10 min', `
      <div class="alert info">Tee 1–2× päivässä. <strong>Vain kivuttomalla alueella</strong> – kevyt venytys ok, kipu ei. Kylmä 15 min rutiinin jälkeen rauhoittaa.</div>
      ${renderExList(P.SHOULDER_REHAB_DAILY)}
      <div class="hint" style="margin:6px 0 10px">Napauta liikettä: tekniikka, hyödyt ja video. Kun liikkeet ovat kivuttomia, voimapäivien olkapääblokki (kuminauha ulko-/sisäkierto, kylkimakuu-ulkokierto, matala soutu) vahvistaa.</div>
      <button type="button" class="btn primary block" id="sh-routine-done"${lg.routine ? ' disabled' : ''}>${lg.routine ? '✓ Rutiini tehty tänään' : '✓ Merkitse rutiini tehdyksi'}</button>
    `, (root) => {
      bindExerciseTaps(root);
      const b = root.querySelector('#sh-routine-done');
      if (b) b.onclick = () => {
        setShoulderLog(iso, 'routine', true);
        closeModal();
        toast('Olkapäärutiini tehty');
        rerenderActive();
      };
    });
  }

  function openRescheduleModal(iso) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    const weekStart = P.startOfWeek(P.parseISO(iso));
    let buttons = '';
    for (let i = 0; i < 7; i++) {
      const d = P.addDays(weekStart, i);
      const di = P.toISO(d);
      const label = P.DOW_FI[d.getDay()] + ' ' + d.getDate() + '.';
      const disabled = di === iso ? ' disabled' : '';
      buttons += `<button data-to="${di}"${disabled}>${label}</button>`;
    }
    openModal(
      'Siirrä treeni',
      `<p>Valitse päivä tälle viikolle. Alkuperäinen päivä muuttuu leoksi.</p>
       <div class="day-pick">${buttons}</div>`,
      (root) => {
        root.querySelectorAll('[data-to]').forEach(btn => {
          btn.onclick = () => {
            const to = btn.getAttribute('data-to');
            const session = structuredClone(day.session || day.planned);
            session.modified = 'siirretty';
            session.name = (session.name || '') + ' (siirretty)';
            // Target day
            setOverride(to, {
              session,
              status: 'siirretty',
              completed: false,
              note: 'Siirretty päivästä ' + formatFiDate(iso)
            });
            // Source becomes rest
            setOverride(iso, {
              status: 'siirretty-pois',
              session: {
                type: 'rest',
                subtype: 'moved',
                name: 'Treeni siirretty',
                details: `Alkuperäinen treeni siirretty päivälle ${formatFiDate(to)}.`,
                modified: 'siirretty-pois'
              },
              completed: false
            });
            closeModal();
            toast('Treeni siirretty → ' + formatFiDate(to));
            rerenderActive();
          };
        });
      }
    );
  }


  function openMuuActivityModal(iso, day) {
    openModal('Muu liikunta', `
      <p class="session-desc">Anna treenille nimi (esim. Jooga, Soutu, Hiit).</p>
      <label class="field"><span>Nimi</span>
        <input type="text" id="muu-name" maxlength="40" placeholder="esim. Jooga" /></label>
      <div class="row-actions" style="margin-top:12px">
        <button type="button" class="btn primary" id="muu-ok">Valitse</button>
        <button type="button" class="btn ghost" id="muu-cancel">Peruuta</button>
      </div>
    `, (modal) => {
      const inp = modal.querySelector('#muu-name');
      if (inp) setTimeout(() => inp.focus(), 50);
      modal.querySelector('#muu-cancel').onclick = closeModal;
      modal.querySelector('#muu-ok').onclick = () => {
        const name = (inp && inp.value || '').trim();
        if (!name) { toast('Anna nimi'); return; }
        closeModal();
        applySessionTypeSwap(iso, day, 'muu', { customName: name });
      };
    });
  }

  /** Mutate today's strength/mobility exercises and persist in dayOverrides */
  function mutateSessionExercises(iso, mutator) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    const base = day.session || day.planned;
    if (!base || (base.type !== 'strength' && base.type !== 'mobility')) return;
    const session = typeof structuredClone === 'function'
      ? structuredClone(base)
      : JSON.parse(JSON.stringify(base));
    session.exercises = mutator((session.exercises || []).map((e) => Object.assign({}, e)));
    if (session.type === 'strength' && P.formatStrengthDetails) {
      session.details = P.formatStrengthDetails(session);
    } else if (session.type === 'mobility') {
      session.details = (session.headline || session.name || 'Liikkuvuus') + '\n' +
        (session.exercises || []).map((e) => '• ' + (e.label || e.id) + (e.sets ? ' – ' + e.sets : '')).join('\n');
    }
    session.modified = session.modified === 'tyyppi' ? 'tyyppi' : 'liikkeet';
    setOverride(iso, {
      session,
      status: (state.dayOverrides[iso] && state.dayOverrides[iso].status) || 'liikkeet',
      completed: !!day.completed
    });
    saveState();
  }

  function bindExerciseEdit(root, iso) {
    if (!root) return;
    root.querySelectorAll('[data-ex-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-ex-act');
        const idx = parseInt(btn.getAttribute('data-ex-idx'), 10);
        if (act === 'poista') {
          mutateSessionExercises(iso, (list) => {
            if (idx < 0 || idx >= list.length) return list;
            list.splice(idx, 1);
            return list;
          });
          toast('Liike poistettu');
          rerenderActive();
          return;
        }
        if (act === 'vaihda') {
          openExercisePickerModal(iso, { mode: 'replace', index: idx });
          return;
        }
        if (act === 'lisaa') {
          openExercisePickerModal(iso, { mode: 'add' });
        }
      });
    });
  }

  function openExercisePickerModal(iso, opts) {
    opts = opts || {};
    const day = getEffectiveDay(iso);
    const session = day && (day.session || day.planned);
    const preferMobility = session && session.type === 'mobility';
    const cats = preferMobility
      ? [{ id: 'liikkuvuus', label: 'Liikkuvuus' }, { id: 'voima', label: 'Voima' }, { id: 'all', label: 'Kaikki' }]
      : [{ id: 'voima', label: 'Voima' }, { id: 'liikkuvuus', label: 'Liikkuvuus' }, { id: 'all', label: 'Kaikki' }];
    let activeCat = cats[0].id;

    function listHtml(cat, q) {
      let items = cat === 'all' ? EX.listExercises() : EX.listExercises(cat);
      if (shoulderRehabActive()) items = items.filter((ex) => !ex.loadsShoulder);
      const qq = (q || '').trim().toLowerCase();
      if (qq) items = items.filter((ex) => (ex.name || '').toLowerCase().includes(qq) || (ex.id || '').includes(qq));
      items = items.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fi'));
      if (!items.length) return '<div class="empty">Ei osumia.</div>';
      return '<ul class="ex-picker-list">' + items.map((ex) =>
        `<li><button type="button" class="ex-picker-item" data-pick-id="${esc(ex.id)}">
          <span class="ex-name">${esc(ex.name)}</span>
          <span class="hint">${esc(ex.category || '')}</span>
        </button></li>`
      ).join('') + '</ul>';
    }

    openModal(opts.mode === 'replace' ? 'Vaihda liike' : 'Lisää liike', `
      <div class="ex-library-filters" id="ex-pick-cats">
        ${cats.map((c, i) => `<button type="button" class="btn sm${i === 0 ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`).join('')}
      </div>
      <label class="field"><span>Haku</span>
        <input type="search" id="ex-pick-q" placeholder="Etsi liikettä…" /></label>
      ${opts.mode === 'add' ? `<label class="field"><span>Sarjat (valinnainen)</span>
        <input type="text" id="ex-pick-sets" placeholder="esim. 3×8–10" /></label>` : ''}
      <div id="ex-pick-list" style="max-height:42vh;overflow:auto;margin-top:8px">${listHtml(activeCat, '')}</div>
    `, (modal) => {
      const listEl = modal.querySelector('#ex-pick-list');
      const qEl = modal.querySelector('#ex-pick-q');
      function refresh() {
        listEl.innerHTML = listHtml(activeCat, qEl && qEl.value);
        bindPicks();
      }
      function bindPicks() {
        listEl.querySelectorAll('[data-pick-id]').forEach((b) => {
          b.onclick = () => {
            const id = b.getAttribute('data-pick-id');
            const lib = EX.getExercise(id);
            if (!lib) return;
            const setsInput = modal.querySelector('#ex-pick-sets');
            const sets = (setsInput && setsInput.value.trim()) ||
              (opts.mode === 'replace' && session && session.exercises && session.exercises[opts.index]
                ? session.exercises[opts.index].sets
                : (preferMobility ? '8–10' : '3×8–10'));
            const entry = { id: id, label: lib.name, sets: sets };
            if (opts.mode === 'replace') {
              mutateSessionExercises(iso, (list) => {
                if (opts.index < 0 || opts.index >= list.length) return list;
                list[opts.index] = entry;
                return list;
              });
              toast('Liike vaihdettu: ' + lib.name);
            } else {
              mutateSessionExercises(iso, (list) => {
                list.push(entry);
                return list;
              });
              toast('Lisätty: ' + lib.name);
            }
            closeModal();
            rerenderActive();
          };
        });
      }
      modal.querySelectorAll('#ex-pick-cats [data-cat]').forEach((b) => {
        b.onclick = () => {
          activeCat = b.getAttribute('data-cat');
          modal.querySelectorAll('#ex-pick-cats [data-cat]').forEach((x) => x.classList.toggle('active', x === b));
          refresh();
        };
      });
      if (qEl) qEl.oninput = refresh;
      bindPicks();
    });
  }

  function openModal(title, bodyHtml, bind) {
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    if (modalLevels > 0 && overlay.classList.contains('open')) {
      // sisäkkäinen ikkuna: säilytä alempi ikkuna DOM-solmuina (tapahtumankäsittelijät ja tila säilyvät)
      const frag = document.createDocumentFragment();
      while (modal.firstChild) frag.appendChild(modal.firstChild);
      modalStack.push({ frag, cls: modal.className, scroll: modal.scrollTop });
      modal.className = 'modal';
    } else {
      modalLevels = 0;
      modalStack.length = 0;
    }
    modal.innerHTML = `
      <button class="modal-close" id="modal-x" aria-label="Sulje">×</button>
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    `;
    overlay.classList.add('open');
    modalLevels++;
    const lvl = modalLevels;
    navMutate(() => H.pushState({ treeni: 1, view: currentView, modal: lvl }, ''));
    modal.querySelector('#modal-x').onclick = closeModalTop;
    overlay.onclick = (e) => { if (e.target === overlay) closeModalTop(); };
    if (bind) bind(modal);
  }

  // Sulkee vain ylimmän ikkunan käyttöliittymästä (ei koske historiaan).
  function closeModalTopUI() {
    if (modalLevels <= 0) return;
    const overlay = document.getElementById('modal-overlay');
    const modal = document.getElementById('modal');
    if (coachState && modal.classList.contains('coach-modal')) coachCleanup();
    modalLevels--;
    const prev = modalStack.pop();
    if (prev && modalLevels > 0) {
      modal.innerHTML = '';
      modal.appendChild(prev.frag);
      modal.className = prev.cls;
      modal.scrollTop = prev.scroll || 0;
    } else {
      modalStack.length = 0;
      modalLevels = 0;
      overlay.classList.remove('open');
      modal.className = 'modal';
    }
  }

  // ✕ / tausta / Esc: sulje ylin ikkuna ja poista sen historiamerkintä.
  function closeModalTop() {
    if (modalLevels <= 0) return;
    closeModalTopUI();
    navBack(1);
  }

  // Ohjelmallinen sulku (esim. toiminnon jälkeen): sulje kaikki ikkunat.
  function closeModal() {
    const n = modalLevels;
    while (modalLevels > 0) closeModalTopUI();
    const overlay = document.getElementById('modal-overlay');
    if (overlay) overlay.classList.remove('open');
    if (coachState) coachCleanup();
    navBack(n);
  }

  // ---------- Week ----------
  function weekDayIcon(eff, s) {
    if (eff.completed) return '✓';
    if (eff.status === 'sairas') return '🤒';
    if (eff.status === 'siirretty-pois') return '↪';
    if (eff.status === 'salibandy' || (s && s.salibandyDay)) return '🏒';
    if (!s) return '•';
    if (s.type === 'rest') return '💤';
    if (s.type === 'run') return '🏃';
    if (s.type === 'strength') return s.location === 'koti' ? '🏠' : '🏋️';
    if (s.type === 'race') return '🏁';
    if (s.type === 'mobility') return '🧘';
    if (s.type === 'other') return s.subtype === 'kavely' ? '🚶' : s.subtype === 'salibandy' ? '🏒' : '✨';
    return '•';
  }

  function renderWeek() {
    updateHeader();
    const plan = ensurePlan();
    const ws = P.addDays(P.startOfWeek(new Date()), weekOffset * 7);
    const wsISO = P.toISO(ws);
    let week = plan.weeks.find(w => w.weekStart === wsISO);
    if (!week) {
      week = buildPlan().weeks.find(w => w.weekStart === wsISO) || null;
    }
    const list = document.getElementById('week-list');
    const range = `${formatFiDate(wsISO).replace(/\d{4}$/, '')}–${formatFiDate(P.toISO(P.addDays(ws, 6))).replace(/\d{4}$/, '')}`;
    if (!week || !week.days.length) {
      document.getElementById('week-label').textContent = 'Vk ' + range;
      list.innerHTML = '<div class="empty">Ei treenejä tällä viikolla (tarkista kilpailupäivä).</div>';
      return;
    }
    const todayI = todayISO();
    let km = 0, done = 0, coachDays = 0;
    const rows = week.days.map(d => {
      const eff = getEffectiveDay(d.date) || d;
      const s = eff.session || eff.planned || d.planned;
      if (s && s.distanceKm && s.type !== 'other') km += s.distanceKm;
      if (eff.completed) done++;
      if (s && s.coach) coachDays++;
      doneExtrasFor(d.date).forEach(l => { if (l.type === 'run' && l.distanceKm) km += l.distanceKm; });
      const detail = s.distanceKm
        ? s.distanceKm + ' km'
        : (s.durationMin ? '~' + s.durationMin + ' min' : '');
      return `<div class="week-day${d.date === todayI ? ' today' : ''}${eff.completed ? ' done' : ''}${s.coach ? ' coach' : ''}" data-date="${d.date}">
        <div><div class="dow">${P.DOW_FI[d.dow]}</div><div class="date">${formatFiDate(d.date).replace(/\d{4}$/, '')}</div></div>
        <div><div class="name">${s.coach ? '🧭 ' : ''}${esc(s.name)}</div>${detail ? `<div class="detail">${esc(detail)}</div>` : ''}${(() => { const fb = feedbackFor(d.date); return fb ? `<div class="detail pt-fb-mini">💬 PT: ${esc(fb.title || 'palaute')}</div>` : ''; })()}${(() => {
          const g = [];
          if (eff.garmin && eff.garmin.source === 'garmin') g.push(doneSummary({ distanceKm: eff.garmin.km, minutes: eff.garmin.min }));
          doneExtrasFor(d.date).forEach(l => g.push('+ ' + l.name + (doneSummary(l) ? ' ' + doneSummary(l) : '')));
          return g.length ? `<div class="detail garmin-mini">Garmin ✓ ${esc(g.filter(Boolean).join(' · '))}</div>` : '';
        })()}</div>
        <div class="status-ico">${weekDayIcon(eff, s)}</div>
      </div>`;
    }).join('');
    km = Math.round(km * 10) / 10;
    document.getElementById('week-label').textContent = 'Vk ' + range;
    list.innerHTML = `<div class="week-summary hint">${esc(week.phaseName || '')}${week.deload ? ' · kevyempi viikko' : ''} · juoksua ~${km} km · tehty ${done}/7${coachDays ? ' · 🧭 = valmentajalta' : ''}</div>` + rows;

    list.querySelectorAll('.week-day').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        if (date === todayISO()) showView('today');
        else openDayDetail(date);
      });
    });
  }

  function openDayDetail(iso) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    const s = day.session || day.planned;
    openModal(
      day.dowLabel + ' ' + formatFiDate(iso),
      `<div class="session-title">${esc(s.name)}</div>
       <div class="session-meta" style="margin:8px 0">${sessionBadges(day)}</div>
       ${renderSessionBody(s)}
       ${renderFeedbackCard(feedbackFor(iso), { inline: true })}
       <button class="btn primary block" id="d-done" style="margin-top:14px"${day.completed ? ' disabled' : ''}>✓ Merkitse tehdyksi</button>
       <div class="status-grid two" style="margin-top:8px">
         <button class="status-btn" id="d-keventa">↓ Kevennä</button>
         <button class="status-btn" id="d-koventa">↑ Kovenna</button>
         <button class="status-btn" id="d-siirra">Siirrä…</button>
         <button class="status-btn danger" id="d-sairas">🤒 Sairas</button>
       </div>`,
      (root) => {
        const go = (act) => { closeModal(); handleAction(iso, act); showView('week'); };
        root.querySelector('#d-done').onclick = () => go('done');
        root.querySelector('#d-keventa').onclick = () => go('keventa');
        root.querySelector('#d-koventa').onclick = () => go('koventa');
        root.querySelector('#d-siirra').onclick = () => { closeModal(); openRescheduleModal(iso); };
        root.querySelector('#d-sairas').onclick = () => go('sairas');
        bindExerciseTaps(root);
        bindFeedbackToggles(root);
      }
    );
  }

  // ---------- Progress ----------
  const TP = typeof TreeniProgress !== 'undefined' ? TreeniProgress : null;

  function getMonthlyCheckins() {
    if (!Array.isArray(state.monthlyCheckins)) state.monthlyCheckins = [];
    return state.monthlyCheckins;
  }

  function saveMonthlyCheckins(showToast) {
    try {
      saveState();
      if (TP && TP.overPhotoSoftLimit(getMonthlyCheckins())) {
        toast('Varoitus: kuvat vievät paljon tilaa. Poista vanhoja jos tallennus pettää.');
      } else if (showToast) {
        toast('Kuukausimerkintä tallennettu');
      }
    } catch (e) {
      toast('Tallennus epäonnistui (localStorage täynnä?)');
    }
  }

  function syncWeightFromCheckins() {
    const list = TP ? TP.sortEntriesDesc(getMonthlyCheckins()) : getMonthlyCheckins().slice();
    const withW = list.find(e => e.weightKg != null);
    if (withW) {
      state.health.weightKg = withW.weightKg;
    }
  }

  function renderMonthlySection() {
    if (!TP) {
      return `<div class="card"><h2>Kuukausiseuranta</h2>
        <div class="alert warn">progress.js puuttuu.</div></div>`;
    }
    const entries = getMonthlyCheckins();
    const groups = TP.groupByMonth(entries);
    const bytes = TP.totalPhotoBytes(entries);
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    const warn = TP.overPhotoSoftLimit(entries)
      ? `<div class="alert warn">Kuvat ~${mb} Mt – lähellä localStorage-rajaa. Poista vanhoja kuvia.</div>`
      : (bytes > 0 ? `<div class="hint">Kuvat tallessa laitteella (~${mb} Mt)</div>` : '');

    let gallery = '';
    if (!groups.length) {
      gallery = '<div class="empty">Ei vielä kuukausimerkintöjä. Lisää paino + valinnaiset progress-kuvat.</div>';
    } else {
      gallery = groups.map(g => {
        const e = g.latest;
        const ph = TP.primaryPhoto(e);
        const thumb = ph
          ? `<img class="mp-thumb" src="${ph.dataUrl}" alt="Progress ${esc(g.label)}" />`
          : `<div class="mp-thumb mp-thumb-empty">Ei kuvaa</div>`;
        const w = g.weightKg != null ? `${g.weightKg} kg` : '—';
        const meta = [];
        if (e.waistCm != null) meta.push(`vyötärö ${e.waistCm} cm`);
        const n = g.entries.length;
        return `<button type="button" class="mp-month-card" data-mp-month="${esc(g.key)}">
          ${thumb}
          <div class="mp-month-meta">
            <strong>${esc(g.label)}</strong>
            <div>${esc(w)}${n > 1 ? ` · ${n} merk.` : ''}</div>
            ${meta.length ? `<div class="hint">${esc(meta.join(' · '))}</div>` : ''}
            <div class="hint">${formatFiDate(e.date)}</div>
          </div>
        </button>`;
      }).join('');
      if (groups.length >= 2) {
        gallery += `<button type="button" class="btn block" id="mp-compare-btn" style="margin-top:10px">Vertaa kahta kuukautta</button>`;
      }
    }

    return `
      <div class="card" id="mp-card">
        <h2>Kuukausiseuranta</h2>
        <p class="hint" style="margin-bottom:10px">Paino + 1–3 progress-kuvaa kerran kuussa. Kuvat pysyvät vain tällä laitteella.</p>
        ${warn}
        <button type="button" class="btn primary block" id="mp-add-btn">+ Lisää merkintä</button>
        <div class="section-title">Galleria kuukausittain</div>
        <div class="mp-gallery" id="mp-gallery">${gallery}</div>
      </div>`;
  }

  function bindMonthlySection() {
    const add = document.getElementById('mp-add-btn');
    if (add) add.onclick = () => openMonthlyEntryModal(null);
    document.querySelectorAll('[data-mp-month]').forEach(btn => {
      btn.onclick = () => openMonthDetailModal(btn.getAttribute('data-mp-month'));
    });
    const cmp = document.getElementById('mp-compare-btn');
    if (cmp) cmp.onclick = () => openCompareModal();
  }

  function openMonthlyEntryModal(existingId) {
    if (!TP) return;
    const existing = existingId
      ? getMonthlyCheckins().find(e => e.id === existingId)
      : null;
    const draft = existing
      ? JSON.parse(JSON.stringify(existing))
      : {
          id: uid(),
          date: todayISO(),
          weightKg: state.health.weightKg != null ? state.health.weightKg : '',
          notesFront: '',
          notesSide: '',
          photos: [],
          waistCm: '',
          restingHr: '',
          hrv: '',
          sleepHours: '',
          energy: ''
        };
    // Keep photos in closure for edit
    let photos = (draft.photos || []).slice(0, 3);

    function photosHtml() {
      if (!photos.length) return '<div class="hint">Ei vielä kuvia (max 3).</div>';
      return `<div class="mp-photo-previews">${photos.map((p, i) => `
        <div class="mp-photo-prev">
          <img src="${p.dataUrl}" alt="${esc(p.kind === 'side' ? 'Sivu' : (p.kind === 'back' ? 'Taka' : 'Etu'))}" />
          <div class="mp-photo-prev-actions">
            <span class="badge">${p.kind === 'side' ? 'Sivu' : (p.kind === 'back' ? 'Taka' : 'Etu')}</span>
            <button type="button" class="btn sm ghost" data-mp-rm-photo="${i}">Poista</button>
          </div>
        </div>`).join('')}</div>`;
    }

    openModal(existing ? 'Muokkaa merkintää' : 'Uusi kuukausimerkintä', `
      <div class="form-group">
        <label>Päivämäärä</label>
        <input type="date" id="mp-date" value="${esc(draft.date || todayISO())}" />
      </div>
      <div class="form-group">
        <label>Paino (kg)</label>
        <input type="number" id="mp-weight" step="0.1" min="30" max="250"
          value="${draft.weightKg != null && draft.weightKg !== '' ? esc(draft.weightKg) : ''}"
          placeholder="esim. 78.5" />
      </div>
      <div class="form-group">
        <label>Vyötärö (cm, valinnainen)</label>
        <input type="number" id="mp-waist" step="0.5" min="40" max="200"
          value="${draft.waistCm != null && draft.waistCm !== '' ? esc(draft.waistCm) : ''}" />
      </div>
      <div class="form-group">
        <label>Muistiinpano</label>
        <input type="text" id="mp-notes-front" maxlength="500"
          value="${esc(draft.notesFront || '')}" placeholder="Valinnainen" />
      </div>
      <div class="form-group">
        <label>Progress-kuvat (1–3)</label>
        <div id="mp-photos-wrap">${photosHtml()}</div>
        <div class="mp-photo-add" id="mp-photo-add-row" ${photos.length >= 3 ? 'style="display:none"' : ''}>
          <label class="file-drop mp-file-drop">
            📷 Kamera / tiedosto
            <input type="file" id="mp-photo-input" accept="image/*" capture="environment" />
          </label>
          <select id="mp-photo-kind" aria-label="Kuvan tyyppi">
            <option value="front">Etu</option>
            <option value="side">Sivu</option>
            <option value="back">Taka</option>
          </select>
        </div>
        <div class="hint">Pakataan JPEG max ~900 px, laatu ~0.7. Tallennus localStorageen.</div>
      </div>
      <div class="row-actions">
        <button type="button" class="btn primary" id="mp-save">Tallenna</button>
        <button type="button" class="btn ghost" id="mp-cancel">Peruuta</button>
        ${existing ? '<button type="button" class="btn danger" id="mp-delete">Poista</button>' : ''}
      </div>
    `, (root) => {
      function refreshPhotos() {
        root.querySelector('#mp-photos-wrap').innerHTML = photosHtml();
        const addRow = root.querySelector('#mp-photo-add-row');
        if (addRow) addRow.style.display = photos.length >= 3 ? 'none' : '';
        root.querySelectorAll('[data-mp-rm-photo]').forEach(btn => {
          btn.onclick = () => {
            photos.splice(+btn.getAttribute('data-mp-rm-photo'), 1);
            refreshPhotos();
          };
        });
      }
      refreshPhotos();

      const input = root.querySelector('#mp-photo-input');
      if (input) {
        input.onchange = async () => {
          const file = input.files && input.files[0];
          input.value = '';
          if (!file) return;
          if (photos.length >= 3) {
            toast('Max 3 kuvaa / merkintä');
            return;
          }
          try {
            toast('Pakataan kuvaa…');
            const kind = root.querySelector('#mp-photo-kind').value || 'front';
            const res = await TP.compressImageFile(file, { maxEdge: 900, quality: 0.7 });
            photos.push({ id: uid(), dataUrl: res.dataUrl, kind });
            // Prefer distinct kinds (front / side / back)
            {
              const order = ['front', 'side', 'back'];
              const used = new Set(photos.map((p) => p.kind));
              const next = order.find((k) => !used.has(k)) || 'front';
              root.querySelector('#mp-photo-kind').value = next;
            }
            refreshPhotos();
            toast('Kuva lisätty (~' + Math.round(res.bytes / 1024) + ' kt)');
          } catch (err) {
            toast('Kuvan käsittely epäonnistui');
          }
        };
      }

      root.querySelector('#mp-cancel').onclick = closeModal;
      root.querySelector('#mp-save').onclick = () => {
        // Vanhat kentät (leposyke, HRV, uni, energia, sivumuistiinpano) säilyvät muokatessa
        const keep = (v) => (v == null ? '' : v);
        const raw = {
          id: draft.id,
          date: root.querySelector('#mp-date').value || todayISO(),
          weightKg: root.querySelector('#mp-weight').value,
          notesFront: root.querySelector('#mp-notes-front').value,
          notesSide: keep(draft.notesSide),
          photos,
          waistCm: root.querySelector('#mp-waist').value,
          restingHr: keep(draft.restingHr),
          hrv: keep(draft.hrv),
          sleepHours: keep(draft.sleepHours),
          energy: keep(draft.energy)
        };
        const entry = TP.normalizeEntry(raw);
        if (!entry.date) {
          toast('Anna päivämäärä');
          return;
        }
        if (entry.weightKg == null && !entry.photos.length && entry.waistCm == null) {
          toast('Lisää vähintään paino tai kuva');
          return;
        }
        const list = getMonthlyCheckins();
        const ix = list.findIndex(e => e.id === entry.id);
        // Probe quota before committing large photos
        const probe = list.slice();
        if (ix >= 0) probe[ix] = entry; else probe.push(entry);
        const prev = state.monthlyCheckins;
        state.monthlyCheckins = probe;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (err) {
          state.monthlyCheckins = prev;
          toast('Tallennus epäonnistui – localStorage täynnä. Poista vanhoja kuvia.');
          return;
        }
        syncWeightFromCheckins();
        saveState();
        closeModal();
        if (TP.overPhotoSoftLimit(getMonthlyCheckins())) {
          toast('Tallennettu – kuvatila lähes täynnä');
        } else {
          toast('Kuukausimerkintä tallennettu');
        }
        renderProgress();
      };

      const del = root.querySelector('#mp-delete');
      if (del) {
        del.onclick = () => {
          if (!confirm('Poistetaanko tämä merkintä?')) return;
          state.monthlyCheckins = getMonthlyCheckins().filter(e => e.id !== draft.id);
          syncWeightFromCheckins();
          saveState();
          closeModal();
          toast('Merkintä poistettu');
          renderProgress();
        };
      }
    });
  }

  function openMonthDetailModal(monthKey) {
    if (!TP) return;
    const groups = TP.groupByMonth(getMonthlyCheckins());
    const g = groups.find(x => x.key === monthKey);
    if (!g) return;
    const html = g.entries.map(e => {
      const thumbs = (e.photos || []).map(p =>
        `<img class="mp-thumb sm" src="${p.dataUrl}" alt="${esc(p.kind)}" />`
      ).join('') || '<span class="hint">Ei kuvaa</span>';
      const bits = [];
      if (e.weightKg != null) bits.push(`<strong>${e.weightKg} kg</strong>`);
      if (e.waistCm != null) bits.push(`vyötärö ${e.waistCm} cm`);
      const notes = [e.notesFront, e.notesSide].filter(Boolean).map(esc).join(' · ');
      return `<div class="mp-entry-row">
        <div class="mp-entry-thumbs">${thumbs}</div>
        <div class="mp-entry-info">
          <div>${formatFiDate(e.date)} · ${bits.join(' · ') || '—'}</div>
          ${notes ? `<div class="hint">${notes}</div>` : ''}
          <div class="row-actions" style="margin-top:6px">
            <button type="button" class="btn sm" data-mp-edit="${esc(e.id)}">Muokkaa</button>
            <button type="button" class="btn sm ghost" data-mp-del="${esc(e.id)}">Poista</button>
          </div>
        </div>
      </div>`;
    }).join('');

    openModal(g.label, `
      ${html}
      <div class="row-actions" style="margin-top:12px">
        <button type="button" class="btn primary" id="mp-compare-this">Vertaa toiseen kuukauteen</button>
        <button type="button" class="btn" id="mp-add-this-month">+ Merkintä tähän kuukauteen</button>
        <button type="button" class="btn ghost" id="mp-close-detail">Sulje</button>
      </div>
    `, (root) => {
      root.querySelector('#mp-close-detail').onclick = closeModal;
      const cmpThis = root.querySelector('#mp-compare-this');
      if (cmpThis) {
        cmpThis.onclick = () => {
          closeModal();
          const groups = TP.groupByMonth(getMonthlyCheckins());
          const other = groups.find(x => x.key !== monthKey);
          openCompareModal(other ? other.key : monthKey, monthKey);
        };
      }
      root.querySelector('#mp-add-this-month').onclick = () => {
        closeModal();
        openMonthlyEntryModal(null);
        // Pre-fill mid-month date after modal opens – set via timeout
        setTimeout(() => {
          const dateEl = document.getElementById('mp-date');
          if (dateEl && !getMonthlyCheckins().some(e => e.date.startsWith(monthKey) && e.date === todayISO())) {
            // keep today if same month, else first of month
            if (!todayISO().startsWith(monthKey)) dateEl.value = monthKey + '-15';
          }
        }, 0);
      };
      root.querySelectorAll('[data-mp-edit]').forEach(btn => {
        btn.onclick = () => {
          closeModal();
          openMonthlyEntryModal(btn.getAttribute('data-mp-edit'));
        };
      });
      root.querySelectorAll('[data-mp-del]').forEach(btn => {
        btn.onclick = () => {
          if (!confirm('Poistetaanko merkintä?')) return;
          const id = btn.getAttribute('data-mp-del');
          state.monthlyCheckins = getMonthlyCheckins().filter(e => e.id !== id);
          syncWeightFromCheckins();
          saveState();
          toast('Poistettu');
          closeModal();
          renderProgress();
        };
      });
    });
  }

  function openCompareModal(preA, preB) {
    if (!TP) return;
    const groups = TP.groupByMonth(getMonthlyCheckins());
    if (groups.length < 2) {
      toast('Tarvitaan vähintään kaksi kuukautta');
      return;
    }
    const opts = groups.map(g =>
      `<option value="${esc(g.key)}">${esc(g.label)}${g.weightKg != null ? ' · ' + g.weightKg + ' kg' : ''}</option>`
    ).join('');
    const defaultA = preA || groups[1].key;
    const defaultB = preB || groups[0].key;

    openModal('Vertaa kuukausia', `
      <div class="form-row-2">
        <div class="form-group">
          <label>Vanhempi</label>
          <select id="mp-cmp-a">${opts}</select>
        </div>
        <div class="form-group">
          <label>Uudempi</label>
          <select id="mp-cmp-b">${opts}</select>
        </div>
      </div>
      <div id="mp-cmp-result"></div>
      <div class="row-actions">
        <button type="button" class="btn ghost" id="mp-cmp-close">Sulje</button>
      </div>
    `, (root) => {
      const selA = root.querySelector('#mp-cmp-a');
      const selB = root.querySelector('#mp-cmp-b');
      selA.value = defaultA;
      selB.value = defaultB;

      function renderCmp() {
        const ga = groups.find(g => g.key === selA.value);
        const gb = groups.find(g => g.key === selB.value);
        const box = root.querySelector('#mp-cmp-result');
        if (!ga || !gb) {
          box.innerHTML = '<div class="empty">Valitse kuukaudet</div>';
          return;
        }
        // Ensure A is older chronologically for delta semantics
        let older = ga, newer = gb;
        if (ga.key > gb.key) { older = gb; newer = ga; }
        const ea = TP.pickCompareEntry(older);
        const eb = TP.pickCompareEntry(newer);
        const delta = TP.weightDelta(
          eb && eb.weightKg != null ? eb.weightKg : newer.weightKg,
          ea && ea.weightKg != null ? ea.weightKg : older.weightKg
        );
        const deltaLabel = TP.formatWeightDelta(delta);
        const deltaClass = delta == null ? '' : (delta < 0 ? 'mp-delta-down' : (delta > 0 ? 'mp-delta-up' : 'mp-delta-flat'));

        const photoA = TP.primaryPhoto(ea, 'front') || TP.primaryPhoto(ea);
        const photoB = TP.primaryPhoto(eb, 'front') || TP.primaryPhoto(eb);
        const sideA = TP.primaryPhoto(ea, 'side');
        const sideB = TP.primaryPhoto(eb, 'side');

        let slider = '';
        if (photoA && photoB) {
          slider = `
            <div class="section-title">Etu – liukusäädin</div>
            <div class="mp-compare-slider" id="mp-slider">
              <img class="mp-cmp-base" src="${photoB.dataUrl}" alt="Uudempi" />
              <div class="mp-cmp-top" id="mp-cmp-top" style="width:50%">
                <img src="${photoA.dataUrl}" alt="Vanhempi" />
              </div>
              <input type="range" min="0" max="100" value="50" id="mp-cmp-range" aria-label="Vertailu" />
              <div class="mp-cmp-labels">
                <span>${esc(older.label)}</span>
                <span>${esc(newer.label)}</span>
              </div>
            </div>`;
        } else {
          slider = `
            <div class="mp-compare-sidebyside">
              <div>
                <div class="hint">${esc(older.label)}</div>
                ${photoA ? `<img src="${photoA.dataUrl}" alt="" />` : '<div class="mp-thumb mp-thumb-empty">Ei kuvaa</div>'}
              </div>
              <div>
                <div class="hint">${esc(newer.label)}</div>
                ${photoB ? `<img src="${photoB.dataUrl}" alt="" />` : '<div class="mp-thumb mp-thumb-empty">Ei kuvaa</div>'}
              </div>
            </div>`;
        }

        let sideBlock = '';
        if (sideA || sideB) {
          sideBlock = `
            <div class="section-title">Sivu</div>
            <div class="mp-compare-sidebyside">
              <div>
                <div class="hint">${esc(older.label)}</div>
                ${sideA ? `<img src="${sideA.dataUrl}" alt="" />` : '<div class="mp-thumb mp-thumb-empty">—</div>'}
              </div>
              <div>
                <div class="hint">${esc(newer.label)}</div>
                ${sideB ? `<img src="${sideB.dataUrl}" alt="" />` : '<div class="mp-thumb mp-thumb-empty">—</div>'}
              </div>
            </div>`;
        }

        const wOld = ea && ea.weightKg != null ? ea.weightKg : older.weightKg;
        const wNew = eb && eb.weightKg != null ? eb.weightKg : newer.weightKg;

        box.innerHTML = `
          <div class="mp-delta ${deltaClass}">
            Paino: ${wOld != null ? wOld + ' kg' : '—'} → ${wNew != null ? wNew + ' kg' : '—'}
            <strong>(${deltaLabel})</strong>
          </div>
          ${slider}
          ${sideBlock}
        `;

        const range = box.querySelector('#mp-cmp-range');
        const top = box.querySelector('#mp-cmp-top');
        const sliderEl = box.querySelector('#mp-slider');
        if (range && top && sliderEl) {
          const topImg = top.querySelector('img');
          const syncW = () => {
            const w = sliderEl.clientWidth || sliderEl.offsetWidth;
            if (topImg && w) topImg.style.width = w + 'px';
          };
          syncW();
          range.oninput = () => { top.style.width = range.value + '%'; };
          setTimeout(syncW, 50);
        }
      }

      selA.onchange = renderCmp;
      selB.onchange = renderCmp;
      root.querySelector('#mp-cmp-close').onclick = closeModal;
      renderCmp();
    });
  }

  let coachMsgOffset = 0;

  function renderFeedbackHistory() {
    const fb = (coachPlan && coachPlan.feedback) || {};
    const keys = Object.keys(fb).filter(k => k <= todayISO()).sort().reverse().slice(0, 10);
    if (!keys.length) return '';
    return `<div class="card pt-fb-hist">
      <h2>💬 PT:n palautteet</h2>
      ${keys.map(k => `<details class="pt-fb-item"><summary><span class="when">${esc(feedbackDateLabel(k))}</span> ${esc(fb[k].title || 'Palaute')}</summary>
        <div class="pt-fb-text">${esc(fb[k].text)}</div></details>`).join('')}
    </div>`;
  }

  /** Valmentajan palaute: yksi viesti kerrallaan, lasketaan paikallisesta datasta. */
  function renderProgressCoach() {
    if (!TP || !TP.coachMessage) return '';
    let msg;
    try {
      msg = TP.coachMessage({
        today: todayISO(),
        log: state.log || [],
        weights: getMonthlyCheckins().filter(e => e.weightKg != null).map(e => ({ date: e.date, kg: e.weightKg }))
      }, coachMsgOffset);
    } catch (e) {
      return '';
    }
    const ico = msg.tone === 'praise' ? '🔥' : msg.tone === 'kick' ? '👊' : '🧭';
    const title = msg.tone === 'praise' ? 'Ansaittu' : msg.tone === 'kick' ? 'Rehellisesti' : 'Valmentaja';
    return `<div class="card coach-msg tone-${msg.tone}" id="coach-msg">
      <div class="coach-msg-head"><span>${ico} ${title}</span>${msg.count > 1
        ? `<button type="button" class="coach-msg-next" id="coach-msg-next" aria-label="Seuraava viesti">↻ ${msg.index + 1}/${msg.count}</button>` : ''}</div>
      <div class="coach-msg-text">${esc(msg.text)}</div>
    </div>`;
  }

  function renderProgress() {
    updateHeader();
    const now = new Date();
    const weekStart = P.startOfWeek(now);

    let weekKm = 0;
    let strengthDone = 0;
    let completedCount = 0;

    for (let i = 0; i < 7; i++) {
      const iso = P.toISO(P.addDays(weekStart, i));
      const day = getEffectiveDay(iso);
      if (!day || !day.completed) continue;
      completedCount++;
      const s = day.session || day.planned;
      // Kevyt muu liikunta (kävely ym.) ei lisää juoksukilometreihin
      if (s && s.type !== 'other' && s.distanceKm) weekKm += s.distanceKm;
      if (s && s.type === 'strength') strengthDone++;
    }
    // Garminin lisäaktiviteetit (ei suunnitelmassa): lasketaan mukaan
    const weekStartIso = P.toISO(weekStart), weekEndIso = P.toISO(P.addDays(weekStart, 6));
    (state.log || []).filter(l => l.extra && l.date >= weekStartIso && l.date <= weekEndIso).forEach(l => {
      completedCount++;
      if (l.type === 'run' && l.distanceKm) weekKm += l.distanceKm;
      if (l.type === 'strength') strengthDone++;
    });
    weekKm = Math.round(weekKm * 10) / 10;

    const cutoff = P.toISO(P.addDays(now, -28));
    // Juoksukilometrit: kävely/salibandy (type other) ei lisää
    const logKm = Math.round(state.log.filter(l => l.date >= cutoff && l.type !== 'other')
      .reduce((s, l) => s + (l.distanceKm || 0), 0) * 10) / 10;

    let weightBox = '';
    if (TP) {
      const groups = TP.groupByMonth(getMonthlyCheckins());
      const latest = groups.find(g => g.weightKg != null);
      if (latest) {
        const prev = groups.slice(groups.indexOf(latest) + 1).find(g => g.weightKg != null);
        const d = prev ? TP.weightDelta(latest.weightKg, prev.weightKg) : null;
        weightBox = `<div class="stat-box"><div class="num">${latest.weightKg}</div><div class="lbl">kg${d != null ? ' · ' + esc(TP.formatWeightDelta(d)) : ''}</div></div>`;
      }
    }

    document.getElementById('progress-content').innerHTML = `
      ${renderProgressCoach()}
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${weekKm}</div><div class="lbl">km tällä viikolla</div></div>
        <div class="stat-box"><div class="num">${completedCount}</div><div class="lbl">treeniä tehty / vk</div></div>
        <div class="stat-box"><div class="num">${strengthDone}</div><div class="lbl">voimaa / vk</div></div>
        <div class="stat-box"><div class="num">${logKm}</div><div class="lbl">km / 4 vk</div></div>
        ${weightBox}
      </div>
      ${renderFeedbackHistory()}
      ${renderMonthlySection()}
      <div class="card">
        <h2>Viimeisimmät treenit</h2>
        ${state.log.length === 0
          ? '<div class="empty">Ei vielä merkittyjä treenejä. Paina Tänään-näkymässä ✓ Valmis.</div>'
          : state.log.slice(0, 10).map(l =>
              `<div class="log-item"><div class="when">${formatFiDate(l.date)}</div>
               <strong>${esc(l.name)}</strong>${l.distanceKm ? ' · ' + l.distanceKm + ' km' : ''}${l.minutes ? ' · ' + Math.round(l.minutes) + ' min' : ''}${l.garminId && l.source === 'garmin' ? ' <span class="badge done garmin">Garmin ✓</span>' : ''}</div>`
            ).join('')}
      </div>
    `;
    bindMonthlySection();
    const nx = document.getElementById('coach-msg-next');
    if (nx) nx.onclick = () => { coachMsgOffset++; renderProgress(); };
  }

  // ---------- Settings ----------
  function renderSettings() {
    updateHeader();
    const s = state.settings;
    const shs = shoulderRehabState();
    const b = state.baseline;
    const dowOpt = (v, label) => {
      const sel = v === 'none'
        ? (s.salibandyDow === 'none' || s.salibandyDow == null || s.salibandyDow === '')
        : (s.salibandyDow !== 'none' && s.salibandyDow !== '' && s.salibandyDow != null && +s.salibandyDow === +v);
      return `<option value="${v}"${sel ? ' selected' : ''}>${label}</option>`;
    };
    document.getElementById('settings-content').innerHTML = `
      <div class="card">
        <h2>Profiili &amp; kisa</h2>
        <div class="form-group">
          <label>Nimi (valinnainen)</label>
          <input type="text" id="set-user-name" value="${esc(s.userName || '')}" placeholder="Etunimi tai lempinimi" autocomplete="given-name" />
          <div class="hint">Vain tällä laitteella.</div>
        </div>
        <div class="form-group">
          <label>Kilpailu</label>
          <input type="text" id="set-race-name" value="${esc(s.raceName)}" />
        </div>
        <div class="form-row">
          <div class="form-group"><label>Päivämäärä</label>
            <input type="date" id="set-race-date" value="${esc(s.raceDate)}" /></div>
          <div class="form-group"><label>Aikatavoite</label>
            <input type="text" id="set-marathon-goal" value="${esc(s.marathonGoal || '')}" placeholder="esim. alle 4 h" /></div>
        </div>
      </div>

      <div class="card">
        <h2>Harjoittelu</h2>
        <div class="form-group">
          <label>Salibandy-ilta (kova päivä)</label>
          <select id="set-salibandy">
            ${dowOpt('none', 'Ei asetettu')}${dowOpt(1, 'Maanantai')}${dowOpt(2, 'Tiistai')}${dowOpt(3, 'Keskiviikko')}
            ${dowOpt(4, 'Torstai')}${dowOpt(5, 'Perjantai')}${dowOpt(6, 'Lauantai')}${dowOpt(0, 'Sunnuntai')}
          </select>
          <div class="hint">Ei laatutreeniä salibandy-iltana eikä seuraavana päivänä.</div>
        </div>
        <label class="toggle-row"><input type="checkbox" id="set-no-gym"${noGym() ? ' checked' : ''} />
          <span><strong>Ei salikorttia</strong><br/>
          <span class="hint">Salitreenit vaihtuvat automaattisesti vastaaviksi kotipiireiksi. Ota pois, kun salikortti on.</span></span></label>
        <details class="settings-fold" id="pt-fold">
          <summary>🏋️ Ennen salia: pyydä PT:tä näyttämään</summary>
          <div class="hint" style="margin:6px 0 8px">Aloittelijana 2–3 PT-kertaa ennen omia salitreenejä. Pyydä näyttämään ja korjaamaan nämä – kevyillä painoilla:</div>
          <ul class="pt-list">
            ${[
              ['back_squat', 'Kyykky (tanko + goblet)', 'syvyys, polvet varpaiden suuntaan, keskivartalon tuki'],
              ['deadlift', 'Maastaveto', 'selkä neutraali, tanko lähellä, lonkasta liike'],
              ['rdl', 'Romanian maastaveto', 'lonkkasarana, takareisien venytys, ei pyöreää selkää'],
              ['bench_press', 'Penkkipunnerrus', 'lapojen asento, tangon rata, olkapäät turvassa'],
              ['overhead_press', 'Pystypunnerrus', 'kylkiluut alas, ei notkoselkää'],
              ['bent_over_row', 'Kulmasoutu / alatalja', 'lavat taakse, ei nykimistä'],
              ['lat_pulldown', 'Ylätalja', 'vetosuunta rintaan, olkapäät alhaalla'],
              ['leg_press', 'Jalkaprässi', 'alaselkä kiinni penkissä, polvet eivät lukitu']
            ].map(([id, name, why]) => `<li><button type="button" class="link-btn" data-ex="${id}">${esc(name)}</button> <span class="hint">– ${esc(why)}</span></li>`).join('')}
          </ul>
          <div class="hint">Kysy myös: lämmittelysarjat, sopiva aloituspaino (RPE 6–7) ja laitteiden säädöt.</div>
        </details>
        <div class="form-row">
          <div class="form-group">
            <label>Voima oletuksena</label>
            <select id="set-strength"${noGym() ? ' disabled title="Ei salikorttia: aina koti"' : ''}>
              <option value="sali"${s.strengthLocation==='sali'?' selected':''}>Sali</option>
              <option value="koti"${s.strengthLocation==='koti'?' selected':''}>Koti</option>
            </select>
          </div>
          <div class="form-group">
            <label>Kuntotaso</label>
            <select id="set-fitness">
              <option value="aloittelija"${s.fitnessLevel==='aloittelija'?' selected':''}>Aloittelija</option>
              <option value="aloittelija-keskitaso"${s.fitnessLevel==='aloittelija-keskitaso'?' selected':''}>Aloitt.–keskitaso</option>
              <option value="keskitaso"${s.fitnessLevel==='keskitaso'?' selected':''}>Keskitaso</option>
              <option value="kokenut"${s.fitnessLevel==='kokenut'?' selected':''}>Kokenut</option>
            </select>
          </div>
        </div>
        <details class="settings-fold">
          <summary>Lähtötaso (varasuunnitelmalle)</summary>
          <div class="hint" style="margin:6px 0 8px">Valmentajan päivät ohittavat automaattisen suunnitelman. Nämä vaikuttavat vain päiviin, joille valmentaja ei ole vielä antanut treeniä.</div>
          <div class="form-row">
            <div class="form-group"><label>Viikkokm</label>
              <input type="number" id="bl-weekly" step="0.1" min="0" value="${b.manualWeeklyKm ?? ''}" placeholder="esim. 20" /></div>
            <div class="form-group"><label>Pisin lenkki (km)</label>
              <input type="number" id="bl-longest" step="0.1" min="0" value="${b.manualLongestKm ?? ''}" placeholder="esim. 16" /></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Leuanvedot (max)</label>
              <input type="number" id="bl-pullups" min="0" max="50" value="${b.pullUpsStrict ?? ''}" /></div>
            <div class="form-group"><label>Punnerrukset (max)</label>
              <input type="number" id="bl-pushups" min="0" max="200" value="${b.pushUpsApprox ?? ''}" /></div>
          </div>
        </details>
        <details class="settings-fold" id="pains-fold">
          <summary>Kivut &amp; vammat${activePains().length ? ` <span class="badge warn-pain">${activePains().length} aktiivinen</span>` : ''}${shs.active ? ' <span class="badge rehab">🩹 olkapäätila</span>' : ''}</summary>
          <div class="shoulder-toggle">
            <label class="toggle-row"><input type="checkbox" id="set-shoulder-rehab"${shs.local ? ' checked' : ''} />
              <span><strong>Olkapää (oikea kiertäjäkalvo) – kuntoutustila</strong><br/>
              <span class="hint">Poistaa olkapäätä kuormittavat liikkeet, lisää kevyen kuntoutusblokin ja päivän muistutuksen.</span></span></label>
            ${shs.source === 'coach'
              ? `<div class="alert ${shs.coach ? 'warn' : 'info'}" style="margin-top:8px">Valmentaja on asettanut tilan: <strong>${shs.coach ? 'PÄÄLLÄ' : 'POIS'}</strong>. Valmentajan asetus on voimassa; oma valintasi otetaan käyttöön, jos valmentaja poistaa asetuksen.</div>`
              : ''}
          </div>
          <div class="hint" style="margin:6px 0 8px">Aktiivinen kipu pehmentää treeniä automaattisesti ja näyttää päivittäisen kysymyksen.</div>
          <div id="pain-list">${renderPainList()}</div>
          <div class="form-row">
            <div class="form-group"><label>Alue</label>
              <select id="pain-area">${BODY_AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
            <div class="form-group"><label>Puoli</label>
              <select id="pain-side">${PAIN_SIDES.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Vakavuus</label>
              <select id="pain-sev">${PAIN_SEVERITIES.map(x => `<option value="${x.id}">${x.label}</option>`).join('')}</select></div>
            <div class="form-group"><label>Tila</label>
              <select id="pain-status">
                <option value="active">Aktiivinen</option>
                <option value="history">Historia</option>
              </select></div>
          </div>
          <div class="form-group">
            <label>Huomiot</label>
            <input type="text" id="pain-notes" placeholder="esim. juoksijan polvi, akilles…" />
          </div>
          <button class="btn block" id="pain-add" type="button">Lisää kipu</button>
        </details>
        <button class="btn primary block" id="save-settings" style="margin-top:14px">Tallenna</button>
      </div>

      <div class="card backup-card">
        <h2>Varmuuskopio</h2>
        <p class="hint" style="margin:0 0 8px">Tiedot ovat vain tällä laitteella. Vie JSON-tiedostoksi ja tuo takaisin esim. uudella puhelimella.</p>
        <button class="btn primary block" id="backup-export" type="button">⬇ Vie JSON</button>
        <label class="file-drop" style="margin-top:10px">
          <input type="file" id="backup-file" accept="*/*" />
          ⬆ Tuo JSON-tiedosto
        </label>
        <details class="settings-fold" open>
          <summary>Kopioi / liitä tekstinä (helpoin puhelimella)</summary>
          <p class="hint" style="margin:8px 0 0">Liitä koko JSON alle ja paina Tuo. Jos tiedosto on iso, käytä mieluummin &quot;Tuo JSON-tiedosto&quot;.</p>
          <button class="btn block" id="backup-copy" type="button" style="margin-top:8px">📋 Kopioi JSON leikepöydälle</button>
          <div class="form-group" style="margin-top:10px">
            <textarea id="backup-paste" rows="6" placeholder='{"app":"treeni-app", ...}'></textarea>
          </div>
          <button class="btn primary block" id="backup-import-paste" type="button">Tuo liitetty JSON</button>
        </details>
        <div id="backup-result" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <details class="settings-fold" style="border-top:0;margin-top:0;padding-top:0">
          <summary>Näin käytät sovellusta</summary>
          ${renderAppTipsHtml()}
        </details>
        <details class="settings-fold">
          <summary>Nollaus</summary>
          <button class="btn ghost block" id="reset-plan" style="margin-top:8px">Luo varasuunnitelma uudelleen</button>
          <button class="btn ghost block" id="reset-all" style="margin-top:8px;color:var(--danger)">Nollaa kaikki tiedot</button>
        </details>
      </div>
    `;

    document.getElementById('save-settings').onclick = saveSettingsFromForm;
    const ngT = document.getElementById('set-no-gym');
    if (ngT) ngT.onchange = () => {
      state.settings.noGymCard = !!ngT.checked;
      state.planCache = null;
      ensurePlan(true);
      saveState();
      toast(ngT.checked ? 'Ei salikorttia: salitreenit kotona' : 'Salikortti käytössä: salitreenit salilla');
      renderSettings();
    };
    document.querySelectorAll('#pt-fold [data-ex]').forEach(b => {
      b.onclick = () => openExerciseDetail(b.getAttribute('data-ex'));
    });
    const shT = document.getElementById('set-shoulder-rehab');
    if (shT) shT.onchange = () => {
      setShoulderRehabLocal(shT.checked);
      const st = shoulderRehabState();
      toast(st.source === 'coach'
        ? 'Oma valinta tallennettu – valmentajan asetus (' + (st.coach ? 'päällä' : 'pois') + ') on voimassa'
        : (shT.checked ? 'Olkapäätila päällä' : 'Olkapäätila pois'));
      renderSettings();
      const pf = document.getElementById('pains-fold');
      if (pf) pf.open = true;
    };
    bindBackupControls();
    const painAdd = document.getElementById('pain-add');
    if (painAdd) painAdd.onclick = () => {
      const area = document.getElementById('pain-area').value;
      const side = document.getElementById('pain-side').value;
      const severity = document.getElementById('pain-sev').value;
      const status = document.getElementById('pain-status').value;
      const notes = document.getElementById('pain-notes').value.trim();
      state.health.pains.push({
        id: uid(), area, side, severity, status, notes,
        condition: (P.detectConditionLabel && P.detectConditionLabel(area, notes, status)) || '',
        createdAt: new Date().toISOString()
      });
      saveState();
      toast('Kipu merkitty');
      renderSettings();
    };
    document.querySelectorAll('[data-pain-act]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-pain-id');
        const act = btn.getAttribute('data-pain-act');
        state.health.pains = state.health.pains.map(p => {
          if (p.id !== id) return p;
          if (act === 'history') return Object.assign({}, p, { status: 'history' });
          if (act === 'active') return Object.assign({}, p, { status: 'active' });
          return p;
        });
        if (act === 'del') state.health.pains = state.health.pains.filter(p => p.id !== id);
        saveState();
        renderSettings();
      };
    });
    document.getElementById('reset-plan').onclick = () => {
      saveSettingsFromForm(false);
      state.planCache = null;
      ensurePlan(true);
      toast('Suunnitelma luotu uudelleen');
      showView('today');
    };
    document.getElementById('reset-all').onclick = () => {
      if (confirm('Nollataanko kaikki paikalliset tiedot? Vie ensin varmuuskopio!')) {
        localStorage.removeItem(STORAGE_KEY);
        state = loadState();
        ensurePlan(true);
        toast('Tiedot nollattu');
        renderSettings();
      }
    };
  }

  /** Lukee lomakkeen. Kentät, joita lomakkeella ei ole, jätetään ennalleen (vanhat tiedot säilyvät). */
  function saveSettingsFromForm(showToast) {
    const s = state.settings;
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : undefined; };
    const rn = val('set-race-name'); if (rn !== undefined) s.raceName = rn.trim() || DEFAULTS.settings.raceName;
    const rd = val('set-race-date'); if (rd !== undefined) s.raceDate = rd || DEFAULTS.settings.raceDate;
    const mg = val('set-marathon-goal'); if (mg !== undefined) s.marathonGoal = mg.trim();
    const un = val('set-user-name'); if (un !== undefined) s.userName = un.trim().slice(0, 40);
    const fl = val('set-fitness'); if (fl !== undefined) s.fitnessLevel = fl;
    const sl = val('set-strength'); if (sl !== undefined) s.strengthLocation = sl;
    const sb = val('set-salibandy'); if (sb !== undefined) s.salibandyDow = sb === 'none' ? 'none' : +sb;

    const b = state.baseline;
    const num = (id, key) => {
      const v = val(id);
      if (v === undefined) return;
      b[key] = v === '' ? null : +v;
    };
    num('bl-weekly', 'manualWeeklyKm');
    num('bl-longest', 'manualLongestKm');
    num('bl-pullups', 'pullUpsStrict');
    num('bl-pushups', 'pushUpsApprox');

    state.planCache = null;
    ensurePlan(true);
    saveState();
    if (showToast !== false) toast('Tallennettu');
    updateHeader();
  }

  function bindBackupControls() {
    const out = document.getElementById('backup-result');
    const show = (cls, msg) => { if (out) out.innerHTML = `<div class="alert ${cls}">${esc(msg)}</div>`; };
    const doImport = (text) => {
      try {
        parseBackup(text); // validoi ennen vahvistusta
      } catch (err) {
        show('warn', 'Tuonti epäonnistui: ' + (err.message || err));
        return;
      }
      if (!confirm('Tuodaanko varmuuskopio? Tiedostossa olevat osiot korvaavat nykyiset tiedot tällä laitteella.')) return;
      try {
        const keys = importBackup(text);
        toast('Varmuuskopio tuotu');
        renderSettings();
        updateHeader();
        const o2 = document.getElementById('backup-result');
        if (o2) o2.innerHTML = `<div class="alert ok">Tuotu: ${esc(keys.join(', '))}</div>`;
      } catch (err) {
        const msg = String(err && err.message || err || '');
        const quota = /quota|exceeded|tallennus|localStorage/i.test(msg);
        show('warn', quota
          ? 'Tuonti epäonnistui: tallennustila täynnä. Poista vanhoja kuukausikuvia Edistymisestä ja kokeile uudelleen.'
          : ('Tuonti epäonnistui: ' + msg));
      }
    };
    const exp = document.getElementById('backup-export');
    if (exp) exp.onclick = () => {
      try {
        const blob = new Blob([backupJson()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'treeni-varmuuskopio-' + todayISO() + '.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
        show('ok', 'Varmuuskopio ladattu. Säilytä tiedosto turvallisesti – se sisältää kaikki tietosi.');
      } catch (err) {
        show('warn', 'Vienti epäonnistui: ' + (err.message || err) + ' – kokeile kopiointia.');
      }
    };
    const cp = document.getElementById('backup-copy');
    if (cp) cp.onclick = () => {
      const json = backupJson();
      const ta = document.getElementById('backup-paste');
      const fallback = () => {
        if (ta) { ta.value = json; ta.focus(); ta.select(); }
        show('info', 'JSON on tekstikentässä – kopioi se käsin (valitse kaikki → kopioi).');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(() => show('ok', 'JSON kopioitu leikepöydälle.'), fallback);
      } else fallback();
    };
    const file = document.getElementById('backup-file');
    if (file) file.onchange = (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => doImport(String(reader.result));
      reader.onerror = () => show('warn', 'Tiedoston luku epäonnistui');
      reader.readAsText(f);
      e.target.value = '';
    };
    const pasteBtn = document.getElementById('backup-import-paste');
    if (pasteBtn) pasteBtn.onclick = () => {
      const ta = document.getElementById('backup-paste');
      const text = ta ? ta.value.trim() : '';
      if (!text) { show('warn', 'Liitä ensin JSON tekstikenttään.'); return; }
      doImport(text);
    };
  }

  function renderPainList() {
    const pains = state.health.pains || [];
    if (!pains.length) return '<div class="empty">Ei merkittyjä kipuja.</div>';
    return pains.map(p => {
      const sev = p.severity === 'mod' ? 'Kohtalainen' : 'Lievä';
      const st = p.status === 'active' ? 'Aktiivinen' : 'Historia';
      return `<div class="pain-item">
        <div><strong>${esc(p.area)}</strong> · ${esc(p.side || '')} · ${sev}
          <span class="badge ${p.status === 'active' ? 'warn-pain' : 'rest'}">${st}</span>
          ${p.notes ? `<div class="hint">${esc(p.notes)}</div>` : ''}
          ${p.condition ? `<div class="hint">${esc(p.condition)}</div>` : ''}
        </div>
        <div class="pain-actions">
          ${p.status === 'active'
            ? `<button class="btn sm" data-pain-act="history" data-pain-id="${esc(p.id)}">→ historia</button>`
            : `<button class="btn sm" data-pain-act="active" data-pain-id="${esc(p.id)}">→ aktiivinen</button>`}
          <button class="btn sm ghost" data-pain-act="del" data-pain-id="${esc(p.id)}">Poista</button>
        </div>
      </div>`;
    }).join('');
  }

  // ---------- Init ----------
  function init() {
    if (H) {
      try { H.scrollRestoration = 'manual'; } catch (e) {}
      H.replaceState({ treeni: 1, view: 'today', modal: 0 }, '');
      window.addEventListener('popstate', navPopstate);
    }
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modalLevels > 0) closeModalTop(); });
    ensurePlan();
    applyCoachDone(); // välimuistissa oleva coach-plan → Garmin ✓ heti, verkkohaku päivittää
    updateHeader();

    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.getAttribute('data-view')));
    });

    document.getElementById('week-prev').onclick = () => { weekOffset--; renderWeek(); };
    document.getElementById('week-next').onclick = () => { weekOffset++; renderWeek(); };
    document.getElementById('week-today').onclick = () => { weekOffset = 0; renderWeek(); };

    showView('today');

    // Valmentajan suunnitelma: hae heti, kun yhteys palaa ja kun sovellus tulee näkyviin
    refreshCoachPlan(true);
    window.addEventListener('online', () => refreshCoachPlan(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshCoachPlan(false);
    });

    // PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
