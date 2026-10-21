/**
 * Garmin Connect CSV -tuonti ja baseline-yhteenveto
 */
(function (global) {
  'use strict';

  function parseCSVLine(line) {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = false;
        } else cur += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { result.push(cur); cur = ''; }
        else cur += c;
      }
    }
    result.push(cur);
    return result;
  }

  function parseCSV(text) {
    // Strip BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
      rows.push(obj);
    }
    return { headers, rows };
  }

  /** Normalisoi sarakkeiden nimet (Garmin / variaatiot) */
  function pick(row, names) {
    for (const n of names) {
      if (row[n] !== undefined && row[n] !== '') return row[n];
      // case-insensitive
      const key = Object.keys(row).find(k => k.toLowerCase() === n.toLowerCase());
      if (key && row[key] !== '') return row[key];
    }
    return '';
  }

  function parseDistanceKm(raw) {
    if (!raw) return 0;
    let s = String(raw).replace(/\s/g, '').replace(',', '.');
    // "5.23" or "5.23 km" or miles?
    const m = s.match(/([\d.]+)/);
    if (!m) return 0;
    let v = parseFloat(m[1]);
    if (/mi/i.test(s)) v *= 1.60934;
    // Garmin sometimes exports meters as large numbers without unit
    if (!/km|mi/i.test(s) && v > 200) v = v / 1000;
    return Math.round(v * 100) / 100;
  }

  function parseDate(raw) {
    if (!raw) return null;
    // 2026-03-15 or 15.03.2026 or 2026-03-15T10:00:00 or "Mar 15, 2026"
    const s = String(raw).trim();
    let d = null;
    const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) d = new Date(+iso[1], +iso[2] - 1, +iso[3]);
    const fi = s.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!d && fi) d = new Date(+fi[3], +fi[2] - 1, +fi[1]);
    const us = s.match(/([A-Za-z]{3})\s+(\d{1,2}),?\s+(\d{4})/);
    if (!d && us) d = new Date(`${us[1]} ${us[2]}, ${us[3]}`);
    if (!d || isNaN(d.getTime())) return null;
    const pad = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function parseTimeMinutes(raw) {
    if (!raw) return 0;
    const s = String(raw).trim();
    // HH:MM:SS or MM:SS
    const parts = s.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    return 0;
  }

  function isRun(type) {
    const t = (type || '').toLowerCase();
    return /run|juoksu|trail|treadmill|track|road/.test(t) &&
      !/walk|kävely|hike|bike|cykl|swim|strength|weight|cardio|elliptical/.test(t);
  }

  /**
   * Kartoi Garmin-tyyppi: run | walk | cycle | swim | cardio | strength | floorball | other
   * Kävelyä / pyörää / uintia / cardioa EI käsitellä kovana juoksuna.
   */
  function classifyActivity(type) {
    const t = (type || '').toLowerCase();
    if (/walk|kävely|hike|vaellus|hiking/.test(t)) return 'walk';
    if (/cycl|bike|pyör|spinning|biking/.test(t)) return 'cycle';
    if (/swim|uinti|allas|pool/.test(t)) return 'swim';
    if (/floorball|salibandy|indoor.?hockey|unihockey/.test(t)) return 'floorball';
    if (/strength|weight.?train|gym|voima|weight_training|resistance/.test(t)) return 'strength';
    if (/cardio|elliptical|crosstrainer|cross.?trainer|row(ing)?|soutu|aerobics|fitness/.test(t)) return 'cardio';
    if (isRun(type)) return 'run';
    return 'other';
  }

  function isLightActivity(kind) {
    return kind === 'walk' || kind === 'cycle' || kind === 'swim' || kind === 'cardio' || kind === 'other';
  }

  function normalizeActivities(rows) {
    return rows.map(row => {
      const type = pick(row, ['Activity Type', 'Type', 'Aktiviteettityyppi', 'activityType']);
      const date = parseDate(pick(row, ['Date', 'Päivämäärä', 'Start Time', 'Start', 'Aloitusaika']));
      const title = pick(row, ['Title', 'Name', 'Nimi', 'Activity Name']);
      const distanceKm = parseDistanceKm(pick(row, ['Distance', 'Distance (km)', 'Matka', 'Matka (km)']));
      const timeMin = parseTimeMinutes(pick(row, ['Time', 'Duration', 'Aika', 'Kesto']));
      const avgHr = parseFloat(String(pick(row, ['Avg HR', 'Average Heart Rate', 'Keskisyke', 'Avg Heart Rate'])).replace(',', '.')) || null;
      const maxHr = parseFloat(String(pick(row, ['Max HR', 'Max Heart Rate', 'Maksimisyke'])).replace(',', '.')) || null;
      const avgPace = pick(row, ['Avg Pace', 'Average Pace', 'Keskivauhti', 'Pace']);
      const elev = parseFloat(String(pick(row, ['Elev Gain', 'Elevation Gain', 'Nousu', 'Total Ascent'])).replace(',', '.')) || null;
      const kind = classifyActivity(type);
      return {
        type, date, title, distanceKm, timeMin, avgHr, maxHr, avgPace, elevGain: elev,
        kind,
        isRun: kind === 'run',
        lightLoad: isLightActivity(kind)
      };
    }).filter(a => a.date);
  }

  function summarizeBaseline(activities, weeksWindow) {
    weeksWindow = weeksWindow || 6;
    const runs = activities.filter(a => a.isRun && a.distanceKm > 0);
    if (!runs.length) {
      return {
        runCount: 0,
        avgWeeklyKm: 0,
        longestRunKm: 0,
        avgRunKm: 0,
        weeksCovered: 0,
        dateFrom: null,
        dateTo: null,
        message: 'Juoksuaktiviteetteja ei löytynyt CSV:stä.'
      };
    }

    runs.sort((a, b) => a.date < b.date ? 1 : -1);
    const latest = runs[0].date;
    const [y, m, d] = latest.split('-').map(Number);
    const latestDate = new Date(y, m - 1, d);
    const cutoff = new Date(latestDate);
    cutoff.setDate(cutoff.getDate() - weeksWindow * 7);
    const pad = n => String(n).padStart(2, '0');
    const cutoffISO = cutoff.getFullYear() + '-' + pad(cutoff.getMonth() + 1) + '-' + pad(cutoff.getDate());

    const recent = runs.filter(a => a.date >= cutoffISO);
    const totalKm = recent.reduce((s, a) => s + a.distanceKm, 0);
    const longest = recent.reduce((mx, a) => Math.max(mx, a.distanceKm), 0);
    const oldest = recent.length ? recent[recent.length - 1].date : null;
    // weeks covered
    let weeksCovered = weeksWindow;
    if (oldest) {
      const [oy, om, od] = oldest.split('-').map(Number);
      const odt = new Date(oy, om - 1, od);
      weeksCovered = Math.max(1, Math.ceil((latestDate - odt) / (7 * 86400000)) + 0.01);
      weeksCovered = Math.min(weeksWindow, weeksCovered);
    }
    const avgWeekly = Math.round((totalKm / weeksCovered) * 10) / 10;
    const avgRun = recent.length ? Math.round((totalKm / recent.length) * 10) / 10 : 0;

    return {
      runCount: recent.length,
      avgWeeklyKm: avgWeekly,
      longestRunKm: Math.round(longest * 10) / 10,
      avgRunKm: avgRun,
      weeksCovered: Math.round(weeksCovered * 10) / 10,
      dateFrom: oldest,
      dateTo: latest,
      totalKm: Math.round(totalKm * 10) / 10,
      message: `Viimeiset ~${Math.round(weeksCovered)} vk: ${recent.length} juoksua, keskim. ${avgWeekly} km/vk, pisin ${Math.round(longest * 10) / 10} km.`
    };
  }

  function importGarminCSV(text, weeksWindow) {
    const { headers, rows } = parseCSV(text);
    const activities = normalizeActivities(rows);
    const summary = summarizeBaseline(activities, weeksWindow || 6);
    const byKind = {};
    activities.forEach(a => {
      byKind[a.kind] = (byKind[a.kind] || 0) + 1;
    });
    summary.byKind = byKind;
    summary.lightActivityCount = activities.filter(a => a.lightLoad).length;
    summary.walkCount = byKind.walk || 0;
    summary.cycleCount = byKind.cycle || 0;
    summary.swimCount = byKind.swim || 0;
    summary.cardioCount = byKind.cardio || 0;
    return {
      headers,
      activities,
      runs: activities.filter(a => a.isRun),
      others: activities.filter(a => !a.isRun),
      summary,
      importedAt: new Date().toISOString()
    };
  }

  // Ei kiinteää henkilökohtaista Garmin-dataa julkisessa koodissa.
  // Oma yhteenveto tuodaan CSV:stä tai varmuuskopio-JSONista (Asetukset → Varmuuskopio).

  /**
   * Extrahoi terveysmittoja CSV:stä vain jos sarakkeet löytyvät.
   * Ei fake-autosynciä – palauttaa null-kentät jos dataa ei ole.
   */
  function extractHealthMetrics(textOrParsed) {
    const parsed = typeof textOrParsed === 'string' ? parseCSV(textOrParsed) : textOrParsed;
    const headers = (parsed.headers || []).map(h => h.toLowerCase());
    const rows = parsed.rows || [];
    const out = { heightCm: null, weightKg: null, bpSys: null, bpDia: null, sleepHours: null, found: [] };

    function headerMatch(patterns) {
      return (parsed.headers || []).find(h => patterns.some(p => p.test(h)));
    }

    const hHeight = headerMatch([/height/i, /pituus/i, /height \(cm\)/i]);
    const hWeight = headerMatch([/weight/i, /paino/i, /weight \(kg\)/i, /body mass/i]);
    const hBp = headerMatch([/blood pressure/i, /verenpaine/i, /bp/i]);
    const hSys = headerMatch([/systolic/i, /sys\b/i, /yläpaine/i]);
    const hDia = headerMatch([/diastolic/i, /dia\b/i, /alapaine/i]);
    const hSleep = headerMatch([/sleep/i, /uni/i, /sleep duration/i, /sleep time/i]);

    function lastNonEmpty(key) {
      if (!key) return null;
      for (let i = rows.length - 1; i >= 0; i--) {
        const v = rows[i][key];
        if (v !== undefined && String(v).trim() !== '') return String(v).trim();
      }
      return null;
    }

    function parseNum(raw) {
      if (raw == null) return null;
      const m = String(raw).replace(',', '.').match(/([\d.]+)/);
      return m ? parseFloat(m[1]) : null;
    }

    if (hHeight) {
      let v = parseNum(lastNonEmpty(hHeight));
      if (v != null) {
        if (v < 3) v = Math.round(v * 100); // meters → cm
        out.heightCm = v;
        out.found.push('height');
      }
    }
    if (hWeight) {
      let v = parseNum(lastNonEmpty(hWeight));
      if (v != null) {
        if (v > 200) v = Math.round(v / 10) / 10; // unlikely grams
        out.weightKg = v;
        out.found.push('weight');
      }
    }
    if (hSys || hDia || hBp) {
      if (hSys) out.bpSys = parseNum(lastNonEmpty(hSys));
      if (hDia) out.bpDia = parseNum(lastNonEmpty(hDia));
      if (hBp && (out.bpSys == null || out.bpDia == null)) {
        const raw = lastNonEmpty(hBp) || '';
        const m = raw.match(/(\d+)\s*[\/\\]\s*(\d+)/);
        if (m) {
          out.bpSys = out.bpSys != null ? out.bpSys : +m[1];
          out.bpDia = out.bpDia != null ? out.bpDia : +m[2];
        }
      }
      if (out.bpSys != null || out.bpDia != null) out.found.push('bloodPressure');
    }
    if (hSleep) {
      const raw = lastNonEmpty(hSleep);
      let v = null;
      if (raw) {
        // "7:30" hours:minutes or decimal hours
        const hm = raw.match(/^(\d+):(\d{2})/);
        if (hm) v = +hm[1] + (+hm[2] / 60);
        else v = parseNum(raw);
        if (v != null && v > 24) v = v / 60; // minutes → hours
      }
      if (v != null) {
        out.sleepHours = Math.round(v * 10) / 10;
        out.found.push('sleep');
      }
    }
    return out;
  }

  global.GarminImport = {
    parseCSV,
    parseCSVLine,
    parseDistanceKm,
    parseDate,
    parseTimeMinutes,
    isRun,
    classifyActivity,
    isLightActivity,
    normalizeActivities,
    summarizeBaseline,
    importGarminCSV,
    extractHealthMetrics
  };
})(typeof window !== 'undefined' ? window : global);
