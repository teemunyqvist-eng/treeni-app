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
      salibandyDow: 'none', // kova joukkuelaji-ilta, asetetaan Asetuksista
      marathonGoal: '',
      raceTime: '',
      postShiftBanner: true, // in-app banner vuoron jälkeen (ei WhatsApp)
      sleepDebt: null // 0–5 subjektiivinen univelka
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
    garmin: null, // Garmin CSV -tuonti tai varmuuskopio täyttää
    dayOverrides: {}, // iso -> { status, completed, session, note, completedAt }
    log: [],
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
      pendingPainFeedback: false
    },
    // Kuukausiseuranta: paino + mittarit + 1–2 progress-kuvaa / merkintä
    monthlyCheckins: [],
    // Vuorokalenteri: iso -> 'aamu'|'ilta'|'yo'
    shifts: {},
    // Dismissed in-app banners: key -> iso date dismissed
    dismissedBanners: {}
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
      if (def && typeof def === 'object' && !Array.isArray(def) && v && typeof v === 'object' && !Array.isArray(v)) {
        next[k] = deepMerge(structuredClone(def), v);
      } else {
        next[k] = structuredClone(v);
      }
    });
    next.planCache = null;
    state = next;
    state.planCache = P.generatePlan(state.settings, garminForPlan());
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

  function ensurePlan(force) {
    const need =
      force ||
      !state.planCache ||
      state.planCache.raceDate !== state.settings.raceDate ||
      !planCoversToday(state.planCache) ||
      !planHasWarmup(state.planCache) ||
      !planHasGym60(state.planCache);
    if (need) {
      state.planCache = P.generatePlan(state.settings, garminForPlan());
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
    const override = state.dayOverrides[iso] || {};
    let session = override.session || found.day.planned;
    // Auto-soften if active pain and session not already pain-modified by user override
    if (session && !override.session && P.applyPainSoftening) {
      const ansMap = answersForDay(iso);
      const softened = P.applyPainSoftening(session, state.health.pains, ansMap);
      if (softened && softened.painSoftened) session = softened;
    } else if (session && override.session && !session.painSoftened) {
      // leave explicit user override as-is
    }
    return {
      ...found.day,
      planned: found.day.planned,
      session,
      status: override.status || null,
      completed: !!override.completed,
      note: override.note || '',
      completedAt: override.completedAt || null,
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

  // ---------- Views ----------
  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    const view = document.getElementById('view-' + name);
    const btn = document.querySelector('.nav button[data-view="' + name + '"]');
    if (view) view.classList.add('active');
    if (btn) btn.classList.add('active');
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
    if (day.completed) html += '<span class="badge done">Tehty</span>';
    if (day.status === 'sairas') html += '<span class="badge skip">Sairas</span>';
    if (day.status === 'toissa') html += '<span class="badge mod">Vuoro</span>';
    if (day.status === 'salibandy' || s.salibandyDay || s.modified === 'salibandy')
      html += '<span class="badge salibandy">Salibandy</span>';
    if (s.modified && s.modified !== 'salibandy') html += '<span class="badge mod">Muokattu</span>';
    if (s.distanceKm && !(s.type === 'other' && s.lightLoad)) html += `<span class="badge">${s.distanceKm} km</span>`;
    if (s.durationMin && (s.type === 'strength' || s.type === 'mobility' || s.type === 'other')) html += `<span class="badge">~${s.durationMin} min</span>`;
    if (s.location === 'sali' || s.location === 'koti') html += `<span class="badge">${s.location === 'sali' ? 'Sali' : 'Koti'}</span>`;
    if (s.painSoftened) html += '<span class="badge warn-pain">Kipu huomioitu</span>';
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
    } else if (optional) {
      badge = '<span class="badge optional">Vapaaehtoinen</span>';
    }
    const teeMyos = optional && block.teeMyos
      ? '<div class="block-kicker">Tee myös <span class="hint-inline">(voit ohittaa)</span></div>'
      : '';
    let html = `<div class="session-block${optional ? ' is-optional' : ' is-warmup'}">`;
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

    const canEdit = !!opts.editable && (s.type === 'strength' || s.type === 'mobility');
    if ((s.type === 'strength' || s.type === 'mobility') && ((s.exercises && s.exercises.length) || canEdit)) {
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

    // Optional mobility / cooldown / gentle
    if (s.mobility) html += renderPrepBlock(s.mobility, 'mobility');
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
    const filtered = exLibFilter === 'kaikki' ? all : all.filter((e) => e.category === exLibFilter);
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
      title: 'Kevennä / Kovenna',
      body: 'Kevennä tiputtaa kuormaa (lyhyempi / kevyempi). Kovenna nostaa, kun fiilis ja keho sallivat. Treeni säilyy – vain taso muuttuu.'
    },
    {
      title: 'Vaihda treeni',
      body: 'Koti · Sali · Juoksu · Lihashuolto vaihtavat päivän tyypin heti. Käytä kun suunnitelma ei sovi paikkaan tai energiaan.'
    },
    {
      title: 'Vuorokalenteri',
      body: 'Merkitse Aamu / Ilta / Yö Tänään-näkymässä. Saat ajoitusvinkin, varoituksen yövuoron jälkeen ja tarvittaessa 20 min minimi-paketin.'
    },
    {
      title: 'Kipu & sairaus',
      body: 'Merkitse kipu (alue) Asetuksista tai pehmennä Tänään-vastauksilla. Sairas = lepo, ei automaattista korvausta. Palaa kevyesti (kävely + venyttely).'
    },
    {
      title: 'Ääniohjattu treeni',
      body: 'Kotivoimassa: 🎙 Ääniohjattu treeni. Sovellus lukee liikkeet ja ajat ääneen – kädet vapaana.'
    },
    {
      title: 'Edistyminen & kuvat',
      body: 'Edistyminen-välilehti: paino, energia, progress-kuvat (1–2 / kk). Vertaa kuukausia rinnakkain.'
    },
    {
      title: 'Varmuuskopio',
      body: 'Asetukset → Varmuuskopio: Vie JSON tallentaa kaikki tiedot tiedostoksi. Tuo JSON (tiedosto tai liitetty teksti) palauttaa ne – myös uudelle laitteelle tai osoitteelle. Tee vienti säännöllisesti.'
    },
    {
      title: 'Kilpailu',
      body: 'Paavo Nurmi Marathon · Turku · 21.8.2027. Päivämäärä ja vaihe näkyvät yläpalkissa; muuta Asetuksista.'
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
    'Yövuoron jälkeen ei kovaa laatua – se on fiksua, ei pehmeää. Mutta 20 min minimi? Ei tekosyitä.',
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

  function renderAppTipsCard() {
    const items = APP_USAGE_TIPS.map(t =>
      `<li><strong>${esc(t.title)}.</strong> ${esc(t.body)}</li>`
    ).join('');
    return `<div class="card tip-card app-tips">
      <h2>Näin käytät sovellusta</h2>
      <ul class="tip-bullets app-tip-list">${items}</ul>
      <p class="hint" style="margin:8px 0 0">Vuorotyö: käytä <strong>Siirrä treeni</strong> tai <strong>Korvaa lyhyemmällä</strong> (20–30 min). Sairaus → lepo.</p>
    </div>`;
  }

  function renderMotivationCard(iso, day) {
    const ctx = motivationContext(day);
    const pools = { done: MOTIVATION_DONE, eased: MOTIVATION_EASED, sick: MOTIVATION_SICK, rest: MOTIVATION_REST };
    const labels = { done: 'Tehty', eased: 'Kevennys', sick: 'Lepo', rest: 'Lepopäivä', default: 'Stay hard' };
    const line = motivationForDay(iso, pools[ctx]);
    return `<div class="card moti-card moti-${ctx}" role="status">
      <div class="moti-label">${esc((labels[ctx] || 'Tänään') + (state.settings.userName ? ', ' + state.settings.userName : ''))}</div>
      <p class="moti-text">${esc(line)}</p>
    </div>`;
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
    const showPrompts = !day.completed && day.status !== 'sairas' &&
      s && (s.type === 'run' || s.type === 'strength') && promptConds.length;

    const shiftToday = getShift(iso);
    const yIso = P.toISO(P.addDays(P.parseISO(iso), -1));
    const shiftYesterday = getShift(yIso);
    const timing = P.suggestTrainingTiming(shiftToday || (shiftYesterday === 'yo' ? 'yo' : null));
    const vitals = latestEnergySleep();
    const offerMinimi = P.shouldOfferMinimiPackage({
      shiftToday,
      shiftYesterday,
      sleepDebt: vitals.sleepDebt,
      energy: vitals.energy
    });
    const warnNight = P.shouldWarnQualityAfterNight(shiftToday, shiftYesterday, s);
    const TP_local = typeof TreeniProgress !== 'undefined' ? TreeniProgress : null;
    const trend = TP_local ? TP_local.rhrHrvTrend(getMonthlyCheckins()) : null;

    // Auto-apply salibandy recovery if yesterday was salibandy and today not yet recovered
    const yOv = state.dayOverrides[yIso];
    if (yOv && yOv.status === 'salibandy' && !day.completed &&
        !(state.dayOverrides[iso] && state.dayOverrides[iso].note === 'Palautus salibandyn jälkeen')) {
      const cur = day.session || day.planned;
      if (cur && !cur.salibandyRecovery &&
          (cur.type === 'run' || cur.type === 'strength')) {
        // ensure override exists for today
        applySalibandyNextDayRecovery(yIso);
        // refresh session reference
        const refreshed = getEffectiveDay(iso);
        if (refreshed) {
          s = refreshed.session || refreshed.planned;
          day = refreshed;
        }
      }
    }

    let guidance = '';
    if (day.status === 'sairas') {
      guidance = '<div class="alert warn">Sairas = lepo. Ei treeniä, ei korvausta, ei syyllisyyttä. Tämän päivän kova valinta on parantua.</div>';
    } else if (day.completed) {
      guidance = '<div class="alert ok">Treeni tehty. Ansaittu – mutta huomenna lasketaan taas nollasta.</div>';
    } else if (day.deload) {
      guidance = '<div class="alert info">Deload-viikko: kevyempi volyymi tarkoituksella. Kevennys on taktiikka, ei lupa luovuttaa.</div>';
    }
    if (warnNight && !day.completed) {
      guidance += '<div class="alert warn">⚠ Yövuoro lähellä – älä tee kovaa laatua tänään. Suosi helppoa tai minimi-pakettia.</div>';
    }
    if (s && s.salibandyRecovery && !day.completed) {
      guidance += '<div class="alert info">🏒 Palautuspäivä salibandyn jälkeen – pidä kevyenä.</div>';
    }
    if (trend && trend.softSuggestion && !day.completed) {
      guidance += `<div class="alert warn">${esc(trend.softSuggestion)}</div>`;
    }

    let painBanner = '';
    if (pains.length) {
      const labels = pains.map(p => {
        const sev = p.severity === 'mod' ? 'kohtalainen' : 'lievä';
        const cond = p.condition ? ` · ${p.condition}` : '';
        return `${p.area}${p.side ? ' (' + p.side + ')' : ''} · ${sev}${cond}`;
      }).join(', ');
      painBanner = `<div class="alert warn">Aktiiviset kivut: ${esc(labels)}</div>`;
    }

    // Vuoron jälkeinen in-app -muistutus (ei WhatsApp)
    let shiftBanner = '';
    const remShift = shiftYesterday === 'yo' || shiftYesterday === 'ilta' ? shiftYesterday
      : (shiftToday === 'yo' || shiftToday === 'ilta' ? shiftToday : null);
    const rem = remShift && state.settings.postShiftBanner !== false
      ? P.postShiftReminderText(remShift) : null;
    const remKey = 'postShift:' + iso;
    if (rem && !(state.dismissedBanners && state.dismissedBanners[remKey]) && !day.completed) {
      shiftBanner = `<div class="alert info shift-banner" id="shift-banner">
        <strong>${esc(rem.title)}</strong>
        <p style="margin:6px 0 10px">${esc(rem.body)}</p>
        <div class="status-grid">
          <button type="button" class="status-btn primary" data-act="minimi-yovuoro">20 min minimi</button>
          <button type="button" class="status-btn" data-act="dismiss-shift-banner">Selvä</button>
        </div>
      </div>`;
    }

    const shiftOpen = !!(shiftToday || shiftYesterday === 'yo' || offerMinimi);
    const shiftCard = `<details class="card shift-card today-fold"${shiftOpen ? ' open' : ''}>
      <summary class="today-fold-sum">
        <span>Vuorokalenteri</span>
        <span class="hint">${shiftToday ? esc(P.SHIFT_LABELS[shiftToday] || shiftToday) : 'Ei vuoroa merkitty'}</span>
      </summary>
      <p class="hint" style="margin:0 0 8px">Merkitse päivän vuoro – saat ajoitusvinkin ja varoitukset.</p>
      <div class="shift-grid" role="group" aria-label="Vuoro">
        <button type="button" class="shift-btn${shiftToday==='aamu'?' active':''}" data-shift="aamu">☀️ Aamu</button>
        <button type="button" class="shift-btn${shiftToday==='ilta'?' active':''}" data-shift="ilta">🌆 Ilta</button>
        <button type="button" class="shift-btn${shiftToday==='yo'?' active':''}" data-shift="yo">🌙 Yö</button>
        <button type="button" class="shift-btn ghost${!shiftToday?' active':''}" data-shift="">Ei vuoroa</button>
      </div>
      ${shiftToday || shiftYesterday === 'yo' ? `
        <div class="hint" style="margin-top:10px">
          <strong>${esc(timing.label)}</strong> · ${esc(timing.when)}<br/>
          ${esc(timing.tip)}
        </div>` : ''}
      ${offerMinimi && !day.completed ? `
        <button type="button" class="btn primary block" style="margin-top:10px" data-act="minimi-yovuoro">
          🌙 Minimi yövuoro -paketti (20 min)
        </button>` : ''}
    </details>`;

    function renderTipCard(tip) {
      if (!tip) return '';
      const cls = tip.tipClass || 'condition-tip';
      return `<div class="card tip-card ${esc(cls)}">
        <h2>${esc(tip.title)}</h2>
        <ul class="tip-bullets">${tip.bullets.map(b => '<li>' + esc(b) + '</li>').join('')}</ul>
        <div class="section-title">Liikkuvuus &amp; voima kirjastosta</div>
        <div class="cue-chip-row">
          ${tip.exerciseIds.map(id => {
            const lib = EX.getExercise(id);
            if (!lib) return '';
            return `<button type="button" class="cue-chip" data-ex="${esc(id)}">${esc(lib.name)}</button>`;
          }).join('')}
        </div>
      </div>`;
    }

    const tipCardsHtml = tipConds.map(renderTipCard).join('');

    let condPromptsHtml = '';
    if (showPrompts || (promptConds.length && !day.completed)) {
      condPromptsHtml = promptConds.map(c => {
        const ans = ansMap[c.id] || null;
        return `<div class="card knee-check condition-check" data-cond="${esc(c.id)}">
          <h2>${esc(c.promptTitle)}</h2>
          <p class="session-desc" style="margin:0 0 10px">${esc(c.promptHint || 'Valinta säätää treenin kuormaa.')}</p>
          <div class="status-grid">
            <button class="status-btn${ans==='ok'?' primary':''}" data-cond-ans="ok" data-cond-id="${esc(c.id)}">OK</button>
            <button class="status-btn warn${ans==='aristaa'?' primary':''}" data-cond-ans="aristaa" data-cond-id="${esc(c.id)}">Aristää</button>
            <button class="status-btn danger${ans==='kipea'?' primary':''}" data-cond-ans="kipea" data-cond-id="${esc(c.id)}">Kipeä</button>
          </div>
          ${ans ? `<div class="hint" style="margin-top:8px">Tänään: ${esc(ans === 'ok' ? 'OK' : ans === 'aristaa' ? 'aristaa' : 'kipeä')}</div>` : ''}
        </div>`;
      }).join('');
    }

    const coachBtn = (s.type === 'strength' && s.location === 'koti' && s.exercises && s.exercises.length && !day.completed)
      ? '<button class="status-btn primary" data-act="voice-coach">🎙 Ääniohjattu treeni</button>'
      : '';

    el.innerHTML = `
      ${shiftBanner}
      ${renderMotivationCard(iso, day)}
      <div class="card today-main">
        <div class="hint today-date">${dow} ${formatFiDate(iso)}</div>
        <div class="session-title">${esc(s.name)}</div>
        <div class="session-meta">${sessionBadges(day)}</div>
        ${guidance}
        ${painBanner}
        ${renderSessionBody(s, { editable: !day.completed && (s.type === 'strength' || s.type === 'mobility') })}

        <div class="today-primary-actions status-grid">
          <button class="status-btn primary" data-act="done"${day.completed ? ' disabled' : ''}>✓ Valmis</button>
          <button class="status-btn" data-act="keventa">Kevennä</button>
          <button class="status-btn" data-act="koventa">Kovenna</button>
          ${coachBtn}
        </div>

        <details class="today-fold">
          <summary class="today-fold-sum"><span>Vaihda treeni</span><span class="hint">Koti · Sali · Juoksu · Lihashuolto</span></summary>
          <div class="swap-grid" role="group" aria-label="Vaihda treenityyppi">
            <button type="button" class="swap-btn${s.type === 'strength' && s.location === 'koti' ? ' active' : ''}" data-act="swap-koti">
              <span class="swap-ico">🏠</span>
              <span class="swap-label">Koti</span>
              <span class="swap-hint">kotivoima</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'strength' && s.location === 'sali' ? ' active' : ''}" data-act="swap-sali">
              <span class="swap-ico">🏋️</span>
              <span class="swap-label">Sali</span>
              <span class="swap-hint">salivoima</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'run' || s.type === 'race' ? ' active' : ''}" data-act="swap-juoksu">
              <span class="swap-ico">🏃</span>
              <span class="swap-label">Juoksu</span>
              <span class="swap-hint">helppo / laatu</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'mobility' || s.subtype === 'lihashuolto' ? ' active' : ''}" data-act="swap-lihashuolto">
              <span class="swap-ico">🧘</span>
              <span class="swap-label">Lihashuolto</span>
              <span class="swap-hint">~25 min</span>
            </button>
          </div>
          <div class="section-title">Muu liikunta</div>
          <div class="swap-grid" role="group" aria-label="Muu liikunta">
            <button type="button" class="swap-btn${s.type === 'other' && s.subtype === 'kavely' ? ' active' : ''}" data-act="swap-kavely">
              <span class="swap-ico">🚶</span>
              <span class="swap-label">Kävely</span>
              <span class="swap-hint">kevyt</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'other' && s.subtype === 'pyoraily' ? ' active' : ''}" data-act="swap-pyoraily">
              <span class="swap-ico">🚴</span>
              <span class="swap-label">Pyöräily</span>
              <span class="swap-hint">ristiin</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'other' && s.subtype === 'uinti' ? ' active' : ''}" data-act="swap-uinti">
              <span class="swap-ico">🏊</span>
              <span class="swap-label">Uinti</span>
              <span class="swap-hint">kevyt</span>
            </button>
            <button type="button" class="swap-btn${s.type === 'other' && s.subtype === 'muu' ? ' active' : ''}" data-act="swap-muu">
              <span class="swap-ico">✨</span>
              <span class="swap-label">Muu</span>
              <span class="swap-hint">oma nimi</span>
            </button>
          </div>
          <div class="hint" style="margin-top:6px">Salibandy: käytä alla <strong>🏒 Salibandy / kova</strong>. Kävelyä ei lasketa kovaksi juoksuksi.</div>
        </details>

        <details class="today-fold">
          <summary class="today-fold-sum"><span>Päivän tila</span><span class="hint">Sairas · vuoro · siirrä · lyhyt</span></summary>
          <div class="status-grid">
            <button class="status-btn danger" data-act="sairas">Sairas</button>
            <button class="status-btn warn" data-act="toissa">Töissä / vuoro</button>
            <button class="status-btn salibandy" data-act="salibandy">🏒 Salibandy / kova</button>
            <button class="status-btn" data-act="ei-fiilista">Ei fiilistä</button>
            <button class="status-btn info" data-act="siirra">Siirrä treeni</button>
            <button class="status-btn info" data-act="lyhyt">Korvaa lyhyemmällä</button>
          </div>
        </details>
      </div>
      ${shiftCard}
      ${condPromptsHtml}
      ${tipCardsHtml}
      ${renderAppTipsCard()}
    `;

    el.querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', () => handleAction(iso, btn.getAttribute('data-act')));
    });
    el.querySelectorAll('[data-shift]').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-shift') || null;
        setShift(iso, v || null);
        toast(v ? ('Vuoro: ' + (P.SHIFT_LABELS[v] || v)) : 'Vuoro poistettu');
        renderToday();
      });
    });
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
        renderToday();
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
    renderToday();
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
        at: new Date().toISOString()
      });
      if (state.log.length > 200) state.log.length = 200;
      if (activePains().length) {
        state.health.pendingPainFeedback = true;
      }
      saveState();
      toast('Tehty. Yksi vene kannettu.');
      renderToday();
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
      renderToday();
      return;
    }

    if (act === 'toissa') {
      openWorkModal(iso);
      return;
    }

    if (act === 'ei-fiilista') {
      openMoodModal(iso);
      return;
    }

    if (act === 'keventa') {
      session = P.applyKeventa(session);
      setOverride(iso, { status: 'keventa', session });
      toast('Kevennetty ≈30 % – taktiikka, ei luovutus');
      renderToday();
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
      renderToday();
      return;
    }

    if (act === 'swap-loc') {
      // Taaksepäin yhteensopiva: sali ↔ koti
      session = P.swapLocation(session);
      setOverride(iso, { session, status: day.status || 'sijainti' });
      toast(session.location === 'koti' ? 'Vaihdettu kotitreeniksi' : 'Vaihdettu salitreeniksi');
      renderToday();
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
      renderToday();
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
      renderToday();
      return;
    }

    if (act === 'minimi-yovuoro') {
      const pack = P.buildMinimiYovuoroPackage();
      setOverride(iso, {
        status: 'minimi',
        session: pack,
        note: 'Minimi yövuoro -paketti',
        completed: false
      });
      toast('Minimi-paketti (20 min) valittu');
      renderToday();
      return;
    }

    if (act === 'dismiss-shift-banner') {
      state.dismissedBanners = state.dismissedBanners || {};
      state.dismissedBanners['postShift:' + iso] = iso;
      saveState();
      renderToday();
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

  function getShift(iso) {
    return (state.shifts && state.shifts[iso]) || null;
  }

  function setShift(iso, shift) {
    state.shifts = state.shifts || {};
    if (!shift) delete state.shifts[iso];
    else state.shifts[iso] = shift;
    saveState();
  }


  function latestEnergySleep() {
    const TP = typeof TreeniProgress !== 'undefined' ? TreeniProgress : null;
    const list = getMonthlyCheckins();
    let energy = null, sleep = null;
    if (TP) {
      const sorted = TP.sortEntriesDesc(list);
      for (const e of sorted) {
        if (energy == null && e.energy != null) energy = e.energy;
        if (sleep == null && e.sleepHours != null) sleep = e.sleepHours;
        if (energy != null && sleep != null) break;
      }
    }
    return { energy, sleep, sleepDebt: state.settings.sleepDebt };
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
          renderToday();
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

  function openWorkModal(iso) {
    openModal(
      'Töissä / vuoro',
      `<p>Vuoro haittaa treeniä. Valitse:</p>
       <div class="action-row" style="flex-direction:column">
         <button class="btn primary block" id="m-lyhyt">Korvaa lyhyemmällä (20–30 min)</button>
         <button class="btn block" id="m-siirra">Siirrä toiseen päivään tällä viikolla</button>
         <button class="btn block" id="m-skip">Jätä väliin tänään (ei korvausta)</button>
       </div>`,
      (root) => {
        root.querySelector('#m-lyhyt').onclick = () => {
          closeModal();
          handleAction(iso, 'lyhyt');
          setOverride(iso, { status: 'toissa', ...(state.dayOverrides[iso] || {}) });
        };
        root.querySelector('#m-siirra').onclick = () => {
          closeModal();
          openRescheduleModal(iso);
        };
        root.querySelector('#m-skip').onclick = () => {
          const day = getEffectiveDay(iso);
          setOverride(iso, {
            status: 'toissa',
            session: {
              type: 'rest',
              subtype: 'shift-skip',
              name: 'Vuoro – treeni siirretty / väliin',
              details: 'Vuorotyö esti treenin. Ei automaattista korvausta. Voit siirtää myöhemmin.',
              modified: 'toissa',
              original: day.planned
            },
            completed: false,
            note: 'Vuoro'
          });
          closeModal();
          toast('Merkitty vuoroksi');
          renderToday();
        };
      }
    );
  }

  function openMoodModal(iso) {
    openModal(
      'Ei fiilistä',
      `<p>Fiilis on yliarvostettu – rehellisyys ei. Jos oikeasti olet loppu tai jokin on vialla, valitse kevyempi tai lepo. Jos tämä on vain sohvan ääni, sulje ikkuna ja tee treeni.</p>
       <div class="action-row" style="flex-direction:column">
         <button class="btn primary block" id="m-easy">Keveämpi / lyhyempi treeni</button>
         <button class="btn block" id="m-rest">Lepopäivä tänään</button>
       </div>`,
      (root) => {
        root.querySelector('#m-easy').onclick = () => {
          const day = getEffectiveDay(iso);
          const session = P.applyNoMood(day.session || day.planned);
          setOverride(iso, { status: 'ei-fiilista', session });
          closeModal();
          toast('Keveämpi valittu – tee se kunnolla');
          renderToday();
        };
        root.querySelector('#m-rest').onclick = () => {
          setOverride(iso, {
            status: 'ei-fiilista',
            session: {
              type: 'rest',
              subtype: 'mood-rest',
              name: 'Lepo – ei fiilistä',
              details: 'Palautumispäivä. Huomenna ei neuvotella.',
              modified: 'ei-fiilista'
            }
          });
          closeModal();
          toast('Lepopäivä merkitty – huomenna ei tekosyitä');
          renderToday();
        };
      }
    );
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
            renderToday();
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
          renderToday();
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
            renderToday();
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
    modal.innerHTML = `
      <button class="modal-close" id="modal-x" aria-label="Sulje">×</button>
      <h2>${esc(title)}</h2>
      ${bodyHtml}
    `;
    overlay.classList.add('open');
    document.getElementById('modal-x').onclick = closeModal;
    overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
    if (bind) bind(modal);
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    const modal = document.getElementById('modal');
    if (modal) modal.classList.remove('coach-modal');
    if (coachState) coachCleanup();
  }

  // ---------- Week ----------
  function renderWeek() {
    updateHeader();
    const plan = ensurePlan();
    const today = new Date();
    const base = P.startOfWeek(today);
    const ws = P.addDays(base, weekOffset * 7);
    const wsISO = P.toISO(ws);

    let week = plan.weeks.find(w => w.weekStart === wsISO);
    // If outside cache, build on the fly
    if (!week) {
      const fitness = plan.fitness;
      const raceDate = P.parseISO(state.settings.raceDate);
      const totalWeeksToRace = Math.max(1, Math.ceil(P.daysBetween(P.startOfWeek(today), raceDate) / 7));
      const baseWeekOffset = Math.max(0, 20 - totalWeeksToRace);
      const idx = Math.round(P.daysBetween(P.startOfWeek(today), ws) / 7);
      week = TreeniPlan.generatePlan(state.settings, garminForPlan()).weeks.find(w => w.weekStart === wsISO);
      if (!week) {
        // synthesize
        const wIdx = baseWeekOffset + idx;
        week = null;
      }
    }

    const title = `Vk ${formatFiDate(wsISO).replace(/\.\d{4}$/, '')}–${formatFiDate(P.toISO(P.addDays(ws, 6)))}`;
    document.getElementById('week-label').textContent = week
      ? `${week.phaseName}${week.deload ? ' · deload' : ''} · tavoite ~${week.volumeTargetKm} km`
      : title;

    const list = document.getElementById('week-list');
    const todayI = todayISO();

    // Prefer days from plan; if missing week, generate single week
    let days;
    if (week) {
      days = week.days;
    } else {
      const tmp = P.generatePlan(state.settings, garminForPlan());
      const found = tmp.weeks.find(w => w.weekStart === wsISO);
      days = found ? found.days : [];
    }

    if (!days.length) {
      list.innerHTML = '<div class="empty">Ei treenejä tällä viikolla (tarkista kilpailupäivä).</div>';
      return;
    }

    const shiftLegend = `<div class="card" style="margin-bottom:10px">
      <div class="row-actions" style="align-items:center;gap:8px;flex-wrap:wrap">
        <strong style="flex:1">Viikko</strong>
      </div>
      <div class="hint" style="margin-top:6px">Napauta päivää: avaa tiedot. Vuoro merkitään Tänään-näkymässä (aamu/ilta/yö). Kävely/pyörä/uinti: kevyt aktiivisuus.</div>
    </div>`;

    list.innerHTML = shiftLegend + days.map(d => {
      const eff = getEffectiveDay(d.date) || d;
      const s = eff.session || eff.planned || d.planned;
      const sh = getShift(d.date);
      let ico = '•';
      if (eff.completed) ico = '✓';
      else if (eff.status === 'sairas') ico = '🤒';
      else if (eff.status === 'toissa' || eff.status === 'siirretty-pois') ico = '🏭';
      else if (eff.status === 'lyhyt' || eff.status === 'keventa') ico = '↓';
      else if (eff.status === 'koventa') ico = '↑';
      else if (eff.status === 'salibandy' || (s && s.salibandyDay)) ico = '🏒';
      else if (s.type === 'rest') ico = '💤';
      else if (s.type === 'run') ico = '🏃';
      else if (s.type === 'strength') ico = '💪';
      else if (s.type === 'race') ico = '🏁';
      else if (s.type === 'mobility') ico = '🧘';
      else if (s.type === 'other') {
        if (s.subtype === 'kavely') ico = '🚶';
        else if (s.subtype === 'pyoraily') ico = '🚴';
        else if (s.subtype === 'uinti') ico = '🏊';
        else if (s.subtype === 'salibandy') ico = '🏒';
        else ico = '✨';
      }

      const detail = s.distanceKm
        ? s.distanceKm + ' km'
        : (s.durationMin ? '~' + s.durationMin + ' min' : (s.type === 'rest' ? 'Palautus' : ''));
      const shiftBadge = sh
        ? `<span class="badge shift-${esc(sh)}">${sh === 'aamu' ? 'Aamu' : sh === 'ilta' ? 'Ilta' : 'Yö'}</span> `
        : '';

      return `<div class="week-day${d.date === todayI ? ' today' : ''}${eff.completed ? ' done' : ''}${sh === 'yo' ? ' shift-yo' : ''}" data-date="${d.date}">
        <div><div class="dow">${P.DOW_FI[d.dow]}</div><div class="date">${formatFiDate(d.date).replace(/\.\d{4}$/, '')}</div></div>
        <div><div class="name">${shiftBadge}${esc(s.name)}</div><div class="detail">${esc(detail)}</div></div>
        <div class="status-ico">${ico}</div>
      </div>`;
    }).join('');

    list.querySelectorAll('.week-day').forEach(el => {
      el.addEventListener('click', () => {
        const date = el.getAttribute('data-date');
        if (date === todayISO()) {
          showView('today');
        } else {
          openDayDetail(date);
        }
      });
    });

    // 4 viikon ehdotus (Plan tip)
    const tip = P.fourWeekSuggestion(plan.fitness || {}, state.settings);
    let tipEl = document.getElementById('four-week-tip');
    if (!tipEl) {
      tipEl = document.createElement('div');
      tipEl.id = 'four-week-tip';
      list.parentNode.appendChild(tipEl);
    }
    tipEl.innerHTML = `
      <div class="card plan-tip">
        <h2>4 viikon ehdotus</h2>
        <p class="session-desc" style="white-space:pre-wrap;margin:0">${esc(tip.textFi)}</p>
        <div class="hint" style="margin-top:8px">Polarisoitu: suurin osa helpolla. Salibandy = kova päivä (ei laatua samaan / seuraavaan aamuun).</div>
      </div>`;
  }

  function openDayDetail(iso) {
    const day = getEffectiveDay(iso);
    if (!day) return;
    const s = day.session || day.planned;
    openModal(
      day.dowLabel + ' ' + formatFiDate(iso),
      `<div class="session-title" style="font-size:1.05rem">${esc(s.name)}</div>
       <div class="session-meta" style="margin:8px 0">${sessionBadges(day)}</div>
       ${renderSessionBody(s)}
       <div class="action-row" style="margin-top:14px;flex-direction:column">
         <button class="btn primary block" id="d-done">Merkitse tehdyksi</button>
         <button class="btn block" id="d-keventa">Kevennä</button>
         <button class="btn block" id="d-salibandy">🏒 Salibandy / kova</button>
         <button class="btn block" id="d-lyhyt">Korvaa lyhyemmällä</button>
         <button class="btn block" id="d-siirra">Siirrä treeni</button>
         ${s.type === 'strength' ? '<button class="btn block" id="d-swap">Vaihda sali ↔ koti</button>' : ''}
         <button class="btn block" id="d-sairas">Sairas</button>
       </div>`,
      (root) => {
        const go = (act) => { closeModal(); handleAction(iso, act); showView('week'); };
        root.querySelector('#d-done').onclick = () => go('done');
        root.querySelector('#d-keventa').onclick = () => go('keventa');
        root.querySelector('#d-salibandy').onclick = () => go('salibandy');
        root.querySelector('#d-lyhyt').onclick = () => go('lyhyt');
        root.querySelector('#d-siirra').onclick = () => { closeModal(); openRescheduleModal(iso); };
        const sw = root.querySelector('#d-swap');
        if (sw) sw.onclick = () => go('swap-loc');
        root.querySelector('#d-sairas').onclick = () => go('sairas');
        bindExerciseTaps(root);
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
        if (e.restingHr != null) meta.push(`HR ${e.restingHr}`);
        if (e.hrv != null) meta.push(`HRV ${e.hrv}`);
        if (e.energy != null) meta.push(`energia ${e.energy}/5`);
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
        <p class="hint" style="margin-bottom:10px">Paino, vyötärö, leposyke, energia + 1–2 progress-kuvaa. Kuvat pakataan JPEG-muotoon (~900 px).</p>
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
          restingHr: state.baseline.restingHr != null ? state.baseline.restingHr : '',
          hrv: '',
          sleepHours: state.health.sleepHours != null ? state.health.sleepHours : '',
          energy: ''
        };
    // Keep photos in closure for edit
    let photos = (draft.photos || []).slice(0, 2);

    function photosHtml() {
      if (!photos.length) return '<div class="hint">Ei vielä kuvia (max 2).</div>';
      return `<div class="mp-photo-previews">${photos.map((p, i) => `
        <div class="mp-photo-prev">
          <img src="${p.dataUrl}" alt="${esc(p.kind === 'side' ? 'Sivu' : 'Etu')}" />
          <div class="mp-photo-prev-actions">
            <span class="badge">${p.kind === 'side' ? 'Sivu' : 'Etu'}</span>
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
      <div class="form-row-2">
        <div class="form-group">
          <label>Vyötärö (cm)</label>
          <input type="number" id="mp-waist" step="0.5" min="40" max="200"
            value="${draft.waistCm != null && draft.waistCm !== '' ? esc(draft.waistCm) : ''}" />
        </div>
        <div class="form-group">
          <label>Leposyke</label>
          <input type="number" id="mp-hr" step="1" min="30" max="120"
            value="${draft.restingHr != null && draft.restingHr !== '' ? esc(draft.restingHr) : ''}" />
        </div>
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>HRV (ms, valinnainen)</label>
          <input type="number" id="mp-hrv" step="1" min="5" max="300"
            value="${draft.hrv != null && draft.hrv !== '' ? esc(draft.hrv) : ''}"
            placeholder="esim. 55" />
        </div>
        <div class="form-group">
          <label>Uni (h)</label>
          <input type="number" id="mp-sleep" step="0.1" min="0" max="16"
            value="${draft.sleepHours != null && draft.sleepHours !== '' ? esc(draft.sleepHours) : ''}"
            placeholder="7.5" />
        </div>
      </div>
      <div class="form-group">
        <label>Energia (1–5)</label>
        <select id="mp-energy">
          <option value="">—</option>
          ${[1,2,3,4,5].map(n =>
            `<option value="${n}"${+draft.energy === n ? ' selected' : ''}>${n}${
              n===1?' (väsynyt)':n===3?' (ok)':n===5?' (virkeä)':''}</option>`
          ).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Muistiinpanot (etu)</label>
        <input type="text" id="mp-notes-front" maxlength="500"
          value="${esc(draft.notesFront || '')}" placeholder="Valinnainen" />
      </div>
      <div class="form-group">
        <label>Muistiinpanot (sivu)</label>
        <input type="text" id="mp-notes-side" maxlength="500"
          value="${esc(draft.notesSide || '')}" placeholder="Valinnainen" />
      </div>
      <div class="form-group">
        <label>Progress-kuvat (1–2)</label>
        <div id="mp-photos-wrap">${photosHtml()}</div>
        <div class="mp-photo-add" id="mp-photo-add-row" ${photos.length >= 2 ? 'style="display:none"' : ''}>
          <label class="file-drop mp-file-drop">
            📷 Kamera / tiedosto
            <input type="file" id="mp-photo-input" accept="image/*" capture="environment" />
          </label>
          <select id="mp-photo-kind" aria-label="Kuvan tyyppi">
            <option value="front">Etu</option>
            <option value="side">Sivu</option>
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
        if (addRow) addRow.style.display = photos.length >= 2 ? 'none' : '';
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
          if (photos.length >= 2) {
            toast('Max 2 kuvaa / merkintä');
            return;
          }
          try {
            toast('Pakataan kuvaa…');
            const kind = root.querySelector('#mp-photo-kind').value || 'front';
            const res = await TP.compressImageFile(file, { maxEdge: 900, quality: 0.7 });
            photos.push({ id: uid(), dataUrl: res.dataUrl, kind });
            // Prefer distinct kinds
            if (photos.length === 1) {
              root.querySelector('#mp-photo-kind').value = kind === 'front' ? 'side' : 'front';
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
        const raw = {
          id: draft.id,
          date: root.querySelector('#mp-date').value || todayISO(),
          weightKg: root.querySelector('#mp-weight').value,
          notesFront: root.querySelector('#mp-notes-front').value,
          notesSide: root.querySelector('#mp-notes-side').value,
          photos,
          waistCm: root.querySelector('#mp-waist').value,
          restingHr: root.querySelector('#mp-hr').value,
          hrv: root.querySelector('#mp-hrv') ? root.querySelector('#mp-hrv').value : '',
          sleepHours: root.querySelector('#mp-sleep') ? root.querySelector('#mp-sleep').value : '',
          energy: root.querySelector('#mp-energy').value
        };
        const entry = TP.normalizeEntry(raw);
        if (!entry.date) {
          toast('Anna päivämäärä');
          return;
        }
        if (entry.weightKg == null && !entry.photos.length &&
            entry.restingHr == null && entry.hrv == null && entry.energy == null) {
          toast('Lisää vähintään paino, kuva tai RHR/HRV');
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
        if (entry.restingHr != null) state.baseline.restingHr = entry.restingHr;
        if (entry.sleepHours != null) state.health.sleepHours = entry.sleepHours;
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
      if (e.restingHr != null) bits.push(`HR ${e.restingHr}`);
      if (e.energy != null) bits.push(`energia ${e.energy}/5`);
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

  function renderReadinessAndTrend() {
    const TP = typeof TreeniProgress !== 'undefined' ? TreeniProgress : null;
    const entries = getMonthlyCheckins();
    const now = new Date();
    const monthPrefix = P.toISO(now).slice(0, 7);
    const monthEntries = entries.filter(e => (e.date || '').slice(0, 7) === monthPrefix);

    // Month km + strength from log / overrides (last ~30 days overlapping month)
    let monthKm = 0;
    let strengthDone = 0;
    let strengthPlanned = 0;
    const monthStart = monthPrefix + '-01';
    const daysInScan = 31;
    const start = P.parseISO(monthStart);
    for (let i = 0; i < daysInScan; i++) {
      const d = P.addDays(start, i);
      if (P.toISO(d).slice(0, 7) !== monthPrefix) break;
      if (d > now) break;
      const iso = P.toISO(d);
      const day = getEffectiveDay(iso);
      if (!day) continue;
      const planned = day.planned;
      if (planned && planned.type === 'strength') strengthPlanned++;
      if (day.completed) {
        const s = day.session || planned;
        if (s && s.distanceKm) monthKm += s.distanceKm;
        if (s && s.type === 'strength') strengthDone++;
      }
    }
    monthKm = Math.round(monthKm * 10) / 10;

    const sleepAvg = TP ? TP.averageMetric(monthEntries.length ? monthEntries : entries.slice(0, 6), 'sleepHours') : null;
    const energyAvg = TP ? TP.averageMetric(monthEntries.length ? monthEntries : entries.slice(0, 6), 'energy') : null;
    // Also fall back to health.sleepHours
    const sleepFallback = sleepAvg != null ? sleepAvg : state.health.sleepHours;

    const plan = ensurePlan();
    const weeklyTarget = (plan.weeks[0] && plan.weeks[0].volumeTargetKm) || 20;
    const raceDate = P.parseISO(state.settings.raceDate || '2027-08-21');
    const weeksToRace = Math.ceil(P.daysBetween(P.startOfWeek(now), raceDate) / 7);

    const readiness = P.computeReadinessIndex({
      monthKm,
      targetMonthKm: weeklyTarget * 4,
      strengthDone,
      strengthPlanned: Math.max(strengthPlanned, 8),
      sleepAvg: sleepFallback,
      energyAvg,
      weeksToRace
    });

    const trend = TP ? TP.rhrHrvTrend(entries) : null;
    let trendHtml = '<div class="hint">Lisää leposyke / HRV kuukausimerkintään – trendi näkyy tässä.</div>';
    if (trend && (trend.latestRhr != null || trend.latestHrv != null)) {
      const elev = trend.elevatedRhr ? ' alert warn' : '';
      trendHtml = `<div class="stats-grid" style="margin-top:8px">
        <div class="stat-box"><div class="num">${trend.latestRhr != null ? trend.latestRhr : '—'}</div><div class="lbl">leposyke</div></div>
        <div class="stat-box"><div class="num">${trend.latestHrv != null ? trend.latestHrv : '—'}</div><div class="lbl">HRV</div></div>
        <div class="stat-box"><div class="num">${trend.rhrDelta != null ? ((trend.rhrDelta > 0 ? '+' : '') + trend.rhrDelta) : '—'}</div><div class="lbl">RHR-muutos</div></div>
      </div>
      ${trend.softSuggestion ? `<div class="alert warn" style="margin-top:8px">${esc(trend.softSuggestion)}</div>` : '<div class="hint" style="margin-top:6px">RHR vakaa – ei pehmennystä.</div>'}`;
    }

    return `
      <div class="card readiness-card">
        <h2>Valmiusindeksi</h2>
        <div class="stats-grid">
          <div class="stat-box"><div class="num">${readiness.score}</div><div class="lbl">${esc(readiness.label)} / 100</div></div>
          <div class="stat-box"><div class="num">${readiness.parts.km}</div><div class="lbl">km-osa</div></div>
          <div class="stat-box"><div class="num">${readiness.parts.strength}</div><div class="lbl">voima-osa</div></div>
          <div class="stat-box"><div class="num">${readiness.parts.sleepEnergy}</div><div class="lbl">uni/energia</div></div>
        </div>
        <div class="progress-bar"><span style="width:${readiness.score}%"></span></div>
        <div class="hint">${esc(readiness.tip)} · kk-km ${readiness.monthKm}/${readiness.targetMonthKm}</div>
      </div>
      <div class="card">
        <h2>HRV / leposyke -trendi</h2>
        <p class="hint" style="margin:0 0 6px">Manuaalinen merkintä kuukausiseurannassa. Noussut RHR pehmentää päivän ehdotusta.</p>
        ${trendHtml}
      </div>`;
  }

  function renderProgress() {
    updateHeader();
    const now = new Date();
    const weekStart = P.startOfWeek(now);
    const weekEnd = P.addDays(weekStart, 6);
    const ws = P.toISO(weekStart);
    const we = P.toISO(weekEnd);

    let weekKm = 0;
    let strengthDone = 0;
    let strengthPlanned = 0;
    let completedCount = 0;
    let lightOtherCount = 0;
    let hardOtherCount = 0;

    for (let i = 0; i < 7; i++) {
      const iso = P.toISO(P.addDays(weekStart, i));
      const day = getEffectiveDay(iso);
      if (!day) continue;
      const planned = day.planned;
      if (planned && planned.type === 'strength') strengthPlanned++;
      if (day.completed) {
        completedCount++;
        const s = day.session || planned;
        if (s && s.type === 'other') {
          if (s.lightLoad) lightOtherCount++;
          else hardOtherCount++;
          // Kevyt muu liikunta: ei lisätä juoksu-km:ään (kävely ≠ kova juoksu)
        } else if (s && s.distanceKm) {
          weekKm += s.distanceKm;
        }
        if (s && s.type === 'strength') strengthDone++;
      }
    }
    weekKm = Math.round(weekKm * 10) / 10;

    // Last 4 weeks km from log
    const cutoff = P.toISO(P.addDays(now, -28));
    const recentLog = state.log.filter(l => l.date >= cutoff);
    const logKm = Math.round(recentLog.reduce((s, l) => s + (l.distanceKm || 0), 0) * 10) / 10;

    const plan = ensurePlan();
    const target = (plan.weeks[0] && plan.weeks[0].volumeTargetKm) || 30;

    // Latest monthly weight blurb
    let weightBlurb = '';
    if (TP) {
      const groups = TP.groupByMonth(getMonthlyCheckins());
      if (groups.length) {
        const latest = groups[0];
        const prev = groups[1];
        const d = prev ? TP.weightDelta(latest.weightKg, prev.weightKg) : null;
        weightBlurb = latest.weightKg != null
          ? `<div class="stat-box"><div class="num">${latest.weightKg}</div><div class="lbl">kg · ${esc(TP.formatWeightDelta(d))}</div></div>`
          : '';
      }
    }

    const readinessHtml = renderReadinessAndTrend();

    document.getElementById('progress-content').innerHTML = `
      <div class="stats-grid">
        <div class="stat-box"><div class="num">${weekKm}</div><div class="lbl">km tällä vk</div></div>
        <div class="stat-box"><div class="num">${completedCount}</div><div class="lbl">treeniä tehty</div></div>
        <div class="stat-box"><div class="num">${strengthDone}/${strengthPlanned || 2}</div><div class="lbl">voima / vk</div></div>
        <div class="stat-box"><div class="num">${lightOtherCount}${hardOtherCount ? '+' + hardOtherCount : ''}</div><div class="lbl">muu liikunta</div></div>
        <div class="stat-box"><div class="num">${logKm}</div><div class="lbl">km / 4 vk</div></div>
        ${weightBlurb}
      </div>
      <div class="hint" style="margin:-4px 0 10px">Muu liikunta (kävely/pyörä/uinti) lasketaan kevyesti – ei juoksuvolyymiin.</div>
      ${readinessHtml}
      ${renderMonthlySection()}
      <div class="card">
        <h2>Viikon juoksuvolyymi</h2>
        <div class="progress-bar"><span style="width:${Math.min(100, (weekKm / target) * 100)}%"></span></div>
        <div class="hint">${weekKm} / ~${target} km (suunnitelman tavoite)</div>
      </div>
      <div class="card">
        <h2>Terveys</h2>
        ${renderHealthSummary()}
      </div>
      <div class="card">
        <h2>Garmin-yhteenveto</h2>
        ${renderGarminSummaryCard()}
      </div>
      <div class="card">
        <h2>Lähtötaso</h2>
        ${renderBaselineSummary()}
      </div>
      <div class="card">
        <h2>Viimeisimmät merkinnät</h2>
        ${state.log.length === 0
          ? '<div class="empty">Ei vielä merkittyjä treenejä.</div>'
          : state.log.slice(0, 15).map(l =>
              `<div class="log-item"><div class="when">${formatFiDate(l.date)}</div>
               <strong>${esc(l.name)}</strong>${l.distanceKm ? ' · ' + l.distanceKm + ' km' : ''}</div>`
            ).join('')}
      </div>
    `;
    bindMonthlySection();
  }

  function renderHealthSummary() {
    const h = state.health || {};
    const parts = [];
    parts.push('<ul class="garmin-stats">');
    parts.push(`<li>Pituus: <strong>${h.heightCm != null ? esc(h.heightCm) + ' cm' : '—'}</strong></li>`);
    parts.push(`<li>Paino: <strong>${h.weightKg != null ? esc(h.weightKg) + ' kg' : '—'}</strong></li>`);
    const bp = (h.bpSys != null || h.bpDia != null)
      ? `${h.bpSys ?? '—'} / ${h.bpDia ?? '—'}`
      : '—';
    parts.push(`<li>Verenpaine: <strong>${esc(bp)}</strong></li>`);
    parts.push(`<li>Uni: <strong>${h.sleepHours != null ? esc(h.sleepHours) + ' h' : '—'}</strong></li>`);
    const ap = (h.pains || []).filter(p => p.status === 'active');
    const hp = (h.pains || []).filter(p => p.status === 'history');
    parts.push(`<li>Aktiiviset kivut: <strong>${ap.length ? ap.map(p => p.area + (p.side ? ' ('+p.side+')' : '')).join(', ') : 'ei'}</strong></li>`);
    if (hp.length) parts.push(`<li>Historia: ${esc(hp.map(p => p.area).join(', '))}</li>`);
    parts.push('</ul>');
    parts.push('<div class="hint">Muokkaa asetuksista. Garmin CSV täyttää mitat vain jos sarakkeet löytyvät (ei fake-autosynciä).</div>');
    return parts.join('');
  }

  function renderGarminSummaryCard() {
    const g = state.garmin && state.garmin.summary;
    if (!g) {
      return '<div class="hint">Ei Garmin-yhteenvetoa. Tuo aktiviteetti-CSV tai varmuuskopio Asetuksista.</div>';
    }
    const li = [];
    const period = g.periodLabel || (g.dateFrom && g.dateTo ? `${formatFiDate(g.dateFrom)} – ${formatFiDate(g.dateTo)}` : '');
    if (period) li.push(`<li><strong>${esc(period)}</strong></li>`);
    const counts = [];
    if (g.runCount != null) counts.push(`${g.runCount} juoksua`);
    if (g.floorballCount) counts.push(`${g.floorballCount} salibandy`);
    if (g.strengthCount) counts.push(`${g.strengthCount} voima`);
    if (counts.length) li.push(`<li>${g.activityCount ? esc(g.activityCount) + ' aktiviteettia: ' : ''}${esc(counts.join(', '))}</li>`);
    if (g.avgWeeklyKm || g.longestRunKm) {
      li.push(`<li>${g.totalKm ? 'Juoksu ~' + esc(g.totalKm) + ' km ≈ ' : ''}<strong>${esc(g.avgWeeklyKm || 0)} km/vk</strong>, pisin <strong>${esc(g.longestRunKm || 0)} km</strong></li>`);
    }
    const h = g.highlights || {};
    if (h.easyPace) li.push(`<li>${esc(h.easyPace)}</li>`);
    if (h.longRunsSummary) li.push(`<li>${esc(h.longRunsSummary)}</li>`);
    if (h.qualitySummary) li.push(`<li>${esc(h.qualitySummary)}</li>`);
    if (h.floorballNote) li.push(`<li>${esc(h.floorballNote)}</li>`);
    if (g.pullUpsStrict != null || g.pushUpsApprox != null) {
      li.push(`<li>Voima-baseline: <strong>${esc(g.pullUpsStrict != null ? g.pullUpsStrict : '—')} tiukkaa leuanvetoa</strong>, ~${esc(g.pushUpsApprox != null ? g.pushUpsApprox : '—')} punnerrusta · ei 1RM-dataa → RPE 6–7</li>`);
    }
    if (g.notes) li.push(`<li>${esc(g.notes)}</li>`);
    return `
      <ul class="garmin-stats">${li.join('')}</ul>
      <div class="hint">${g.hardcoded ? 'Tallennettu yhteenveto Garmin-jaksosta (ei raaka-CSV:ää).' : 'Yhteenveto tuodusta CSV:stä.'} Voit tuoda uuden CSV:n asetuksista.</div>`;
  }

  function bOr(g, bl, key, fallback) {
    if (g && g[key] != null) return g[key];
    if (bl && bl[key] != null) return bl[key];
    return fallback;
  }

  function renderBaselineSummary() {
    const b = state.baseline;
    const g = state.garmin && state.garmin.summary;
    let parts = [];
    if (g) parts.push(`<div class="alert ok">${esc(g.message)}</div>`);
    parts.push('<ul style="padding-left:18px;font-size:0.88rem;color:var(--text-muted)">');
    if (b.manualWeeklyKm) parts.push(`<li>Manuaalinen vk-km: ${b.manualWeeklyKm}</li>`);
    if (b.manualLongestKm) parts.push(`<li>Pisin lenkki: ${b.manualLongestKm} km</li>`);
    if (b.pullUpsStrict) parts.push(`<li>Leuanvedot (tiukat): ${b.pullUpsStrict}</li>`);
    if (b.pushUpsApprox) parts.push(`<li>Punnerrukset: ~${b.pushUpsApprox}</li>`);
    if (b.vo2max) parts.push(`<li>VO2max: ${b.vo2max}</li>`);
    else parts.push('<li>VO2max: tuntematon</li>');
    if (b.restingHr) parts.push(`<li>Leposyke: ${b.restingHr}</li>`);
    if (b.time5k) parts.push(`<li>5 km: ${esc(b.time5k)}</li>`);
    else parts.push('<li>Kisatajat: tuntemattomia</li>');
    if (b.time10k) parts.push(`<li>10 km: ${esc(b.time10k)}</li>`);
    if (b.timeHalf) parts.push(`<li>Puolimaraton: ${esc(b.timeHalf)}</li>`);
    if (b.yearsRunning) parts.push(`<li>Juoksuvuosia: ${b.yearsRunning}</li>`);
    if (b.injuryNotes) parts.push(`<li>Huomiot: ${esc(b.injuryNotes)}</li>`);
    parts.push(`<li>Kuntotaso (asetus): ${esc(state.settings.fitnessLevel)}</li>`);
    const sd = state.settings.salibandyDow;
    if (sd !== null && sd !== undefined && sd !== '' && sd !== 'none') {
      parts.push(`<li>Salibandy-ilta: ${esc(P.DOW_FULL[+sd] || sd)}</li>`);
    }
    parts.push('</ul>');
    if (!g && !b.manualWeeklyKm) {
      parts.unshift('<div class="alert warn">Lisää lähtötaso asetuksista (manuaalinen tai Garmin CSV), jotta suunnitelma skaalautuu paremmin.</div>');
    }
    return parts.join('');
  }

  // ---------- Settings ----------
  function renderSettings() {
    updateHeader();
    const s = state.settings;
    const b = state.baseline;
    document.getElementById('settings-content').innerHTML = `
      <div class="card">
        <h2>Profiili</h2>
        <div class="form-group">
          <label>Nimi (valinnainen)</label>
          <input type="text" id="set-user-name" value="${esc(s.userName || '')}" placeholder="Etunimi tai lempinimi" autocomplete="given-name" />
          <div class="hint">Näkyy vain tällä laitteella (tsemppikortissa). Ei lähetetä minnekään.</div>
        </div>
      </div>

      <div class="card">
        <h2>Kilpailu</h2>
        <div class="form-group">
          <label>Nimi</label>
          <input type="text" id="set-race-name" value="${esc(s.raceName)}" />
        </div>
        <div class="form-group">
          <label>Päivämäärä</label>
          <input type="date" id="set-race-date" value="${esc(s.raceDate)}" />
          <div class="hint">Oletus: Paavo Nurmi Marathon, Turku – la 21.8.2027 klo 11.00 (tapahtuma pe–la 20.–21.8.2027; päivämäärä muokattavissa).</div>
        </div>
        <div class="form-group">
          <label>Lähtöaika (valinnainen)</label>
          <input type="time" id="set-race-time" value="${esc(s.raceTime || '')}" />
        </div>
        <div class="form-group">
          <label>Aikatavoite</label>
          <input type="text" id="set-marathon-goal" value="${esc(s.marathonGoal || '')}" placeholder="esim. alle 4 h" />
          <div class="hint">Esim. alle 4 h ≈ 5:41 /km, alle 4:30 ≈ 6:24 /km. Vertaa puolimaratonaikaan: HM-vauhti + ~20–30 s/km on realistinen maratonvauhti.</div>
        </div>
      </div>

      <div class="card">
        <h2>Harjoittelu</h2>
        <div class="form-group">
          <label>Kuntotaso</label>
          <select id="set-fitness">
            <option value="aloittelija"${s.fitnessLevel==='aloittelija'?' selected':''}>Aloittelija (~18 km/vk)</option>
            <option value="aloittelija-keskitaso"${s.fitnessLevel==='aloittelija-keskitaso'?' selected':''}>Aloittelija–keskitaso (~19–22 km/vk)</option>
            <option value="keskitaso"${s.fitnessLevel==='keskitaso'?' selected':''}>Keskitaso (~28 km/vk)</option>
            <option value="kokenut"${s.fitnessLevel==='kokenut'?' selected':''}>Kokenut (~45 km/vk)</option>
          </select>
          <div class="hint">Garmin-/manuaalidata ohittaa oletusvolyymin. Lähtö ~20–25 km/vk, ei hyppyä 35:een.</div>
        </div>
        <div class="form-group">
          <label>Voiman oletussijainti</label>
          <select id="set-strength">
            <option value="sali"${s.strengthLocation==='sali'?' selected':''}>Sali</option>
            <option value="koti"${s.strengthLocation==='koti'?' selected':''}>Koti</option>
          </select>
        </div>
        <div class="form-group">
          <label>Salibandy / kova laji -ilta (kova päivä)</label>
          <select id="set-salibandy">
            <option value="none"${s.salibandyDow==='none'||s.salibandyDow===null||s.salibandyDow===''?' selected':''}>Ei asetettu</option>
            <option value="1"${+s.salibandyDow===1?' selected':''}>Maanantai</option>
            <option value="2"${+s.salibandyDow===2?' selected':''}>Tiistai</option>
            <option value="3"${+s.salibandyDow===3?' selected':''}>Keskiviikko</option>
            <option value="4"${+s.salibandyDow===4?' selected':''}>Torstai</option>
            <option value="5"${+s.salibandyDow===5?' selected':''}>Perjantai</option>
            <option value="6"${+s.salibandyDow===6?' selected':''}>Lauantai</option>
            <option value="0"${s.salibandyDow===0||s.salibandyDow==='0'?' selected':''}>Sunnuntai</option>
          </select>
          <div class="hint">Laatutreeniä ei pidetä salibandy-iltana eikä seuraavana aamuna. Voit myös merkitä päivän 🏒-napilla.</div>
        </div>
        <div class="form-group">
          <label>Univelka (0–5, subjektiivinen)</label>
          <select id="set-sleep-debt">
            <option value="">—</option>
            ${[0,1,2,3,4,5].map(n =>
              `<option value="${n}"${s.sleepDebt!=null && +s.sleepDebt===n?' selected':''}>${n}${
                n===0?' (ei)':n===2?' (jonkin verran)':n===5?' (kova)':''}</option>`
            ).join('')}
          </select>
          <div class="hint">≥2 ehdottaa minimi yövuoro -pakettia Tänään-näkymässä.</div>
        </div>
        <div class="form-group">
          <label>Vuoron jälkeinen muistutus (sovelluksessa)</label>
          <select id="set-post-shift">
            <option value="1"${s.postShiftBanner!==false?' selected':''}>Käytössä (banneri)</option>
            <option value="0"${s.postShiftBanner===false?' selected':''}>Pois</option>
          </select>
          <div class="hint">Ilta-/yövuoron jälkeen: proteiini + kevyt liikkuvuus. Ei WhatsAppia.</div>
        </div>
      </div>

      <div class="card">
        <h2>Lähtötaso (manuaalinen)</h2>
        <div class="form-row">
          <div class="form-group"><label>Viikkokm (viime aikoina)</label>
            <input type="number" id="bl-weekly" step="0.1" min="0" value="${b.manualWeeklyKm ?? ''}" placeholder="esim. 20" /></div>
          <div class="form-group"><label>Pisin lenkki (km)</label>
            <input type="number" id="bl-longest" step="0.1" min="0" value="${b.manualLongestKm ?? ''}" placeholder="esim. 16" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Tiukat leuanvedot (max)</label>
            <input type="number" id="bl-pullups" min="0" max="50" value="${b.pullUpsStrict ?? ''}" placeholder="esim. 5" /></div>
          <div class="form-group"><label>Punnerrukset (max)</label>
            <input type="number" id="bl-pushups" min="0" max="200" value="${b.pushUpsApprox ?? ''}" placeholder="esim. 30" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Leposyke</label>
            <input type="number" id="bl-rhr" min="30" max="120" value="${b.restingHr ?? ''}" /></div>
          <div class="form-group"><label>Garmin VO2max</label>
            <input type="number" id="bl-vo2" step="0.1" min="20" max="90" value="${b.vo2max ?? ''}" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>5 km aika</label>
            <input type="text" id="bl-5k" value="${esc(b.time5k)}" placeholder="25:00" /></div>
          <div class="form-group"><label>10 km aika</label>
            <input type="text" id="bl-10k" value="${esc(b.time10k)}" placeholder="52:00" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Puolimaraton</label>
            <input type="text" id="bl-half" value="${esc(b.timeHalf)}" placeholder="1:55:00" /></div>
          <div class="form-group"><label>Juoksuvuosia</label>
            <input type="number" id="bl-years" min="0" max="60" value="${b.yearsRunning ?? ''}" /></div>
        </div>
        <div class="form-group">
          <label>Vammat / huomiot</label>
          <textarea id="bl-injury">${esc(b.injuryNotes)}</textarea>
        </div>
      </div>

      <div class="card">
        <h2>Terveys &amp; mittarit</h2>
        <div class="form-row">
          <div class="form-group"><label>Pituus (cm)</label>
            <input type="number" id="h-height" min="100" max="250" step="0.1" value="${state.health.heightCm ?? ''}" placeholder="178" /></div>
          <div class="form-group"><label>Paino (kg)</label>
            <input type="number" id="h-weight" min="30" max="250" step="0.1" value="${state.health.weightKg ?? ''}" placeholder="75" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Verenpaine sys</label>
            <input type="number" id="h-bpsys" min="70" max="220" value="${state.health.bpSys ?? ''}" placeholder="120" /></div>
          <div class="form-group"><label>Verenpaine dia</label>
            <input type="number" id="h-bpdia" min="40" max="140" value="${state.health.bpDia ?? ''}" placeholder="80" /></div>
        </div>
        <div class="form-group">
          <label>Uni (tuntia, viime yö / keskiarvo)</label>
          <input type="number" id="h-sleep" min="0" max="16" step="0.1" value="${state.health.sleepHours ?? ''}" placeholder="7.5" />
        </div>
        <div class="hint">Garmin Connect -livesyncia ei ole ilman API:a. CSV-tuonti täyttää nämä vain jos sarakkeet löytyvät; muuten täytä käsin.</div>
      </div>

      <div class="card">
        <h2>Kivut &amp; vammat</h2>
        <div class="hint" style="margin-bottom:8px">Merkitse aktiiviset kivut (vaikuttaa tämän päivän treeniin) ja historia.</div>
        <div id="pain-list">${renderPainList()}</div>
        <div class="section-title">Lisää kipu / vamma</div>
        <div class="form-row">
          <div class="form-group"><label>Alue</label>
            <select id="pain-area">${BODY_AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
          <div class="form-group"><label>Puoli</label>
            <select id="pain-side">${PAIN_SIDES.map(a => `<option value="${a}">${a}</option>`).join('')}</select></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Vakavuus</label>
            <select id="pain-sev">${PAIN_SEVERITIES.map(s => `<option value="${s.id}">${s.label}</option>`).join('')}</select></div>
          <div class="form-group"><label>Tila</label>
            <select id="pain-status">
              <option value="active">Aktiivinen</option>
              <option value="history">Historia</option>
            </select></div>
        </div>
        <div class="form-group">
          <label>Huomiot (esim. juoksijan polvi, akilles, IT-jänne)</label>
          <input type="text" id="pain-notes" placeholder="juoksijan polvi, akilles, plantaari, kiertäjäkalvo…" />
        </div>
        <button class="btn block" id="pain-add" type="button">Lisää</button>
      </div>

      <div class="card">
        <h2>Garmin-yhteenveto</h2>
        ${renderGarminSummaryCard()}
      </div>

      <div class="card">
        <h2>Garmin CSV -tuonti</h2>
        <div class="alert info">
          Live-synkronointi Garmin Connectiin ei ole käytössä ilman API-avaimia.
          Voit tuoda aktiviteetit CSV-tiedostona (Garmin Connect → vientitoiminto) tai täyttää lähtötason ja terveysmitat käsin.
          Terveysmitat (pituus/paino/BP/uni) päivittyvät CSV:stä vain jos sarakkeet löytyvät – emme teeskentele autosynciä.
          Kaikki data säilyy laitteellasi (localStorage), offline-käyttö ok.
        </div>
        <label class="file-drop" id="csv-drop">
          <input type="file" id="csv-file" accept=".csv,text/csv" />
          Napauta ja valitse Garmin-aktiviteetti-CSV
        </label>
        <div id="csv-result" style="margin-top:10px"></div>
        ${state.garmin && state.garmin.summary
          ? `<div class="alert ok" style="margin-top:10px">Tuotu: ${esc(state.garmin.summary.message)}<br>
             <button class="btn sm" id="clear-garmin" style="margin-top:8px">Poista tuonti</button></div>`
          : ''}
      </div>

      <div class="card backup-card">
        <h2>Varmuuskopio</h2>
        <p class="hint" style="margin:0 0 8px">Kaikki tiedot ovat vain tällä laitteella. Vie ne JSON-tiedostoksi ja tuo takaisin esim. uudella puhelimella tai osoitteella. Tuonti korvaa tiedostossa olevat osiot (asetukset, lähtötaso, loki…); muut säilyvät.</p>
        <div class="action-row" style="flex-direction:column">
          <button class="btn primary block" id="backup-export" type="button">⬇ Vie JSON (lataa tiedosto)</button>
          <button class="btn block" id="backup-copy" type="button">📋 Kopioi JSON leikepöydälle</button>
        </div>
        <label class="file-drop" style="margin-top:10px">
          <input type="file" id="backup-file" accept=".json,application/json" />
          Tuo JSON-tiedosto
        </label>
        <div class="form-group" style="margin-top:10px">
          <label>…tai liitä JSON tähän</label>
          <textarea id="backup-paste" rows="4" placeholder='{"app":"treeni-app", ...}'></textarea>
        </div>
        <button class="btn block" id="backup-import-paste" type="button">Tuo liitetty JSON</button>
        <div id="backup-result" style="margin-top:10px"></div>
      </div>

      <div class="card">
        <button class="btn primary block" id="save-settings">Tallenna asetukset &amp; päivitä suunnitelma</button>
        <button class="btn ghost block" id="reset-plan" style="margin-top:8px">Luo suunnitelma uudelleen</button>
        <button class="btn ghost block" id="reset-all" style="margin-top:8px;color:var(--danger)">Nollaa kaikki tiedot</button>
      </div>
    `;

    document.getElementById('save-settings').onclick = saveSettingsFromForm;
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
      if (confirm('Nollataanko kaikki paikalliset tiedot?')) {
        localStorage.removeItem(STORAGE_KEY);
        state = loadState();
        ensurePlan(true);
        toast('Tiedot nollattu');
        renderSettings();
      }
    };
    const clearG = document.getElementById('clear-garmin');
    if (clearG) clearG.onclick = () => {
      state.garmin = null;
      saveState();
      toast('Garmin-tuonti poistettu');
      renderSettings();
    };
    document.getElementById('csv-file').onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = GarminImport.importGarminCSV(String(reader.result), 6);
          state.garmin = {
            summary: result.summary,
            activities: result.activities.slice(0, 500),
            importedAt: result.importedAt,
            fileName: file.name
          };
          // Also nudge baseline if empty
          if (!state.baseline.manualWeeklyKm && result.summary.avgWeeklyKm) {
            state.baseline.manualWeeklyKm = result.summary.avgWeeklyKm;
          }
          if (!state.baseline.manualLongestKm && result.summary.longestRunKm) {
            state.baseline.manualLongestKm = result.summary.longestRunKm;
          }
          let healthNote = '';
          if (GarminImport.extractHealthMetrics) {
            const hm = GarminImport.extractHealthMetrics(String(reader.result));
            if (hm.found && hm.found.length) {
              if (hm.heightCm != null) state.health.heightCm = hm.heightCm;
              if (hm.weightKg != null) state.health.weightKg = hm.weightKg;
              if (hm.bpSys != null) state.health.bpSys = hm.bpSys;
              if (hm.bpDia != null) state.health.bpDia = hm.bpDia;
              if (hm.sleepHours != null) state.health.sleepHours = hm.sleepHours;
              healthNote = '<br>Terveysmitat CSV:stä: ' + hm.found.join(', ');
            } else {
              healthNote = '<br><em>CSV:ssä ei terveysmitta-sarakkeita – täytä käsin. Connect-livesynciä ei ole ilman API:a.</em>';
            }
          }
          saveState();
          document.getElementById('csv-result').innerHTML =
            `<div class="alert ok">${esc(result.summary.message)}<br>Aktiviteetteja: ${result.activities.length} (juoksuja: ${result.runs.length})${healthNote}</div>`;
          toast('Garmin CSV tuotu');
        } catch (err) {
          document.getElementById('csv-result').innerHTML =
            `<div class="alert warn">Tuonti epäonnistui: ${esc(err.message || err)}</div>`;
        }
      };
      reader.readAsText(file);
    };
  }

  function saveSettingsFromForm(showToast) {
    const s = state.settings;
    s.raceName = document.getElementById('set-race-name').value.trim() || DEFAULTS.settings.raceName;
    s.raceDate = document.getElementById('set-race-date').value || DEFAULTS.settings.raceDate;
    const mg = document.getElementById('set-marathon-goal');
    if (mg) s.marathonGoal = mg.value.trim();
    const un = document.getElementById('set-user-name');
    if (un) s.userName = un.value.trim().slice(0, 40);
    const rt = document.getElementById('set-race-time');
    if (rt) s.raceTime = rt.value || '';
    s.fitnessLevel = document.getElementById('set-fitness').value;
    s.strengthLocation = document.getElementById('set-strength').value;
    const saliVal = document.getElementById('set-salibandy').value;
    s.salibandyDow = saliVal === 'none' ? 'none' : +saliVal;
    const debtEl = document.getElementById('set-sleep-debt');
    if (debtEl) {
      s.sleepDebt = debtEl.value === '' ? null : +debtEl.value;
    }
    const psEl = document.getElementById('set-post-shift');
    if (psEl) {
      s.postShiftBanner = psEl.value !== '0';
    }

    const b = state.baseline;
    const num = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const v = el.value;
      return v === '' ? null : +v;
    };
    b.manualWeeklyKm = num('bl-weekly');
    b.manualLongestKm = num('bl-longest');
    b.pullUpsStrict = num('bl-pullups');
    b.pushUpsApprox = num('bl-pushups');
    b.restingHr = num('bl-rhr');
    b.vo2max = num('bl-vo2');
    b.time5k = document.getElementById('bl-5k').value.trim();
    b.time10k = document.getElementById('bl-10k').value.trim();
    b.timeHalf = document.getElementById('bl-half').value.trim();
    b.yearsRunning = num('bl-years');
    b.injuryNotes = document.getElementById('bl-injury').value.trim();

    const h = state.health;
    const numH = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const v = el.value;
      return v === '' ? null : +v;
    };
    if (document.getElementById('h-height')) {
      h.heightCm = numH('h-height');
      h.weightKg = numH('h-weight');
      h.bpSys = numH('h-bpsys');
      h.bpDia = numH('h-bpdia');
      h.sleepHours = numH('h-sleep');
    }

    state.planCache = null;
    ensurePlan(true);
    saveState();
    if (showToast !== false) toast('Asetukset tallennettu');
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
        show('warn', 'Tuonti epäonnistui: ' + (err.message || err));
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
    ensurePlan();
    updateHeader();

    document.querySelectorAll('.nav button').forEach(btn => {
      btn.addEventListener('click', () => showView(btn.getAttribute('data-view')));
    });

    document.getElementById('week-prev').onclick = () => { weekOffset--; renderWeek(); };
    document.getElementById('week-next').onclick = () => { weekOffset++; renderWeek(); };
    document.getElementById('week-today').onclick = () => { weekOffset = 0; renderWeek(); };

    showView('today');

    // PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
