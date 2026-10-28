/**
 * Kuukausiseuranta – paino, mittarit, progress-kuvat
 * Pure helpers (Node-testattavissa) + selainkuvien pakkaus
 */
(function (global) {
  'use strict';

  const MONTH_FI = [
    'tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
    'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'
  ];

  const DEFAULT_COMPRESS = { maxEdge: 900, quality: 0.7, mime: 'image/jpeg' };
  /** Soft warning when encoded photos in state exceed this (bytes of data URLs) */
  const PHOTO_SOFT_LIMIT = 4.5 * 1024 * 1024;

  function monthKey(isoOrDate) {
    if (!isoOrDate) return '';
    const s = String(isoOrDate);
    return s.length >= 7 ? s.slice(0, 7) : '';
  }

  function formatMonthFi(key) {
    if (!key || key.length < 7) return key || '';
    const y = key.slice(0, 4);
    const m = parseInt(key.slice(5, 7), 10);
    if (!m || m < 1 || m > 12) return key;
    const name = MONTH_FI[m - 1];
    return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + y;
  }

  function sortEntriesDesc(entries) {
    return (entries || []).slice().sort((a, b) => {
      if (a.date === b.date) return (b.id || '').localeCompare(a.id || '');
      return a.date < b.date ? 1 : -1;
    });
  }

  /** Group entries by YYYY-MM, newest month first; entries within month newest first */
  function groupByMonth(entries) {
    const sorted = sortEntriesDesc(entries);
    const map = {};
    sorted.forEach((e) => {
      const k = monthKey(e.date);
      if (!k) return;
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    const keys = Object.keys(map).sort((a, b) => (a < b ? 1 : -1));
    return keys.map((k) => ({
      key: k,
      label: formatMonthFi(k),
      entries: map[k],
      latest: map[k][0],
      weightKg: map[k].find((e) => e.weightKg != null)?.weightKg ?? null
    }));
  }

  /** Weight change: newer − older (negative = painonpudotus) */
  function weightDelta(newerKg, olderKg) {
    if (newerKg == null || olderKg == null || isNaN(+newerKg) || isNaN(+olderKg)) return null;
    return Math.round((+newerKg - +olderKg) * 10) / 10;
  }

  function formatWeightDelta(delta) {
    if (delta == null || isNaN(delta)) return '—';
    if (delta === 0) return '±0 kg';
    const sign = delta > 0 ? '+' : '';
    return sign + delta + ' kg';
  }

  function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const i = dataUrl.indexOf(',');
    const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
    // base64 → ~3/4 of string length
    return Math.floor((b64.length * 3) / 4);
  }

  function totalPhotoBytes(entries) {
    let n = 0;
    (entries || []).forEach((e) => {
      (e.photos || []).forEach((p) => {
        n += estimateDataUrlBytes(p.dataUrl);
      });
    });
    return n;
  }

  function overPhotoSoftLimit(entries) {
    return totalPhotoBytes(entries) > PHOTO_SOFT_LIMIT;
  }

  function pickCompareEntry(monthGroup) {
    if (!monthGroup || !monthGroup.entries || !monthGroup.entries.length) return null;
    // Prefer entry that has at least one photo, else latest
    const withPhoto = monthGroup.entries.find((e) => (e.photos || []).length);
    return withPhoto || monthGroup.entries[0];
  }

  function primaryPhoto(entry, preferKind) {
    if (!entry || !entry.photos || !entry.photos.length) return null;
    if (preferKind) {
      const hit = entry.photos.find((p) => p.kind === preferKind);
      if (hit) return hit;
    }
    return entry.photos[0];
  }

  /**
   * Compress File/Blob to JPEG data URL (browser). Node: returns null / rejects without canvas.
   */
  function compressImageFile(file, opts) {
    const o = Object.assign({}, DEFAULT_COMPRESS, opts || {});
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Ei tiedostoa'));
      if (typeof document === 'undefined' || typeof Image === 'undefined') {
        return reject(new Error('Kuvan pakkaus vaatii selaimen'));
      }
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.naturalWidth || img.width;
          let h = img.naturalHeight || img.height;
          if (!w || !h) {
            URL.revokeObjectURL(url);
            return reject(new Error('Virheellinen kuva'));
          }
          const max = o.maxEdge || 900;
          if (w > max || h > max) {
            if (w >= h) {
              h = Math.round((h * max) / w);
              w = max;
            } else {
              w = Math.round((w * max) / h);
              h = max;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          const dataUrl = canvas.toDataURL(o.mime || 'image/jpeg', o.quality != null ? o.quality : 0.7);
          URL.revokeObjectURL(url);
          resolve({
            dataUrl,
            width: w,
            height: h,
            bytes: estimateDataUrlBytes(dataUrl)
          });
        } catch (err) {
          URL.revokeObjectURL(url);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Kuvan lataus epäonnistui'));
      };
      img.src = url;
    });
  }

  /** Validate / normalize a check-in draft before save */
  function normalizeEntry(raw) {
    const e = {
      id: raw.id || ('m' + Date.now().toString(36)),
      date: String(raw.date || '').slice(0, 10),
      weightKg: raw.weightKg === '' || raw.weightKg == null ? null : +raw.weightKg,
      notesFront: (raw.notesFront || '').trim().slice(0, 500),
      notesSide: (raw.notesSide || '').trim().slice(0, 500),
      photos: Array.isArray(raw.photos) ? raw.photos.slice(0, 3).map((p) => ({
        id: p.id || ('ph' + Math.random().toString(36).slice(2, 8)),
        dataUrl: p.dataUrl,
        kind: p.kind === 'side' ? 'side' : (p.kind === 'back' ? 'back' : 'front')
      })).filter((p) => !!p.dataUrl) : [],
      waistCm: raw.waistCm === '' || raw.waistCm == null ? null : +raw.waistCm,
      restingHr: raw.restingHr === '' || raw.restingHr == null ? null : +raw.restingHr,
      hrv: raw.hrv === '' || raw.hrv == null ? null : +raw.hrv,
      energy: raw.energy === '' || raw.energy == null ? null : Math.min(5, Math.max(1, +raw.energy)),
      sleepHours: raw.sleepHours === '' || raw.sleepHours == null ? null : +raw.sleepHours
    };
    if (e.weightKg != null && isNaN(e.weightKg)) e.weightKg = null;
    if (e.waistCm != null && isNaN(e.waistCm)) e.waistCm = null;
    if (e.restingHr != null && isNaN(e.restingHr)) e.restingHr = null;
    if (e.hrv != null && isNaN(e.hrv)) e.hrv = null;
    if (e.energy != null && isNaN(e.energy)) e.energy = null;
    if (e.sleepHours != null && isNaN(e.sleepHours)) e.sleepHours = null;
    return e;
  }

  function averageMetric(entries, key) {
    const vals = (entries || [])
      .map((e) => e[key])
      .filter((v) => v != null && !isNaN(+v))
      .map(Number);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }


  // ---------- Valmentajan palaute (Edistyminen) ----------
  function isoAddDays(iso, n) {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const x = new Date(y, m - 1, d);
    x.setDate(x.getDate() + n);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  }
  function isoDiffDays(a, b) { // b − a päivinä
    const p = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((p(b) - p(a)) / 86400000);
  }
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  const r1 = (x) => Math.round(x * 10) / 10;
  const fmt = (x) => String(r1(x)).replace('.', ',');

  /** Laskee mittarit lokista + painoista. today = 'YYYY-MM-DD'. */
  function progressMetrics(input) {
    const today = String((input && input.today) || '').slice(0, 10);
    const seen = {};
    const log = ((input && input.log) || []).filter((l) => {
      if (!l || !l.date || l.date > today) return false;
      const k = l.date + '|' + (l.name || '');
      if (seen[k]) return false;
      seen[k] = 1;
      return true;
    });
    const isKm = (l) => l.distanceKm > 0 && l.type !== 'other';
    const inRange = (l, from, to) => l.date > isoAddDays(today, -from) && l.date <= isoAddDays(today, -to);
    const sumKm = (from, to) => r1(log.filter((l) => isKm(l) && inRange(l, from, to)).reduce((a, l) => a + +l.distanceKm, 0));
    const maxKm = (from, to) => log.filter((l) => isKm(l) && inRange(l, from, to)).reduce((a, l) => Math.max(a, +l.distanceKm), 0);
    const m = {
      today,
      totalWorkouts: log.length,
      km7: sumKm(7, 0), kmPrev7: sumKm(14, 7),
      km28: sumKm(28, 0), kmPrev28: sumKm(56, 28),
      long28: maxKm(28, 0), longPrev28: maxKm(56, 28),
      daysSinceLast: null, weekStreak: 0, thisWeekCount: 0, dowIndex: 0
    };
    if (log.length) {
      const last = log.reduce((a, l) => (l.date > a ? l.date : a), '');
      m.daysSinceLast = isoDiffDays(last, today);
    }
    // Viikot ma–su: montako peräkkäistä viikkoa ≥3 treeniä
    const [ty, tm, td] = today.split('-').map(Number);
    const dow = new Date(ty, tm - 1, td).getDay();
    m.dowIndex = dow === 0 ? 6 : dow - 1; // 0 = ma
    const wk0 = isoAddDays(today, -m.dowIndex);
    const countWeek = (start) => log.filter((l) => l.date >= start && l.date <= isoAddDays(start, 6)).length;
    m.thisWeekCount = countWeek(wk0);
    let w = m.thisWeekCount >= 3 ? 0 : 1;
    while (w < 60 && countWeek(isoAddDays(wk0, -7 * w)) >= 3) { m.weekStreak++; w++; }
    // Paino
    const ws = ((input && input.weights) || [])
      .filter((x) => x && x.date && x.kg != null && !isNaN(+x.kg) && x.date <= today)
      .map((x) => ({ date: String(x.date).slice(0, 10), kg: +x.kg }))
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    if (ws.length) {
      const latest = ws[ws.length - 1];
      m.weightKg = latest.kg;
      m.weightDate = latest.date;
      m.weighDaysAgo = isoDiffDays(latest.date, today);
      if (ws.length > 1) {
        const older = ws.filter((x) => isoDiffDays(x.date, latest.date) >= 25);
        const ref = older.length ? older[older.length - 1] : ws[0];
        m.weightRefKg = ref.kg;
        m.weightRefDate = ref.date;
        m.weightDelta = r1(latest.kg - ref.kg);
        m.weightSpanDays = Math.max(1, isoDiffDays(ref.date, latest.date));
        m.weightFirstKg = ws[0].kg;
        m.weightFirstDate = ws[0].date;
      }
    }
    return m;
  }

  /** Kaikki tämänhetkiset viestiehdokkaat (tone: praise | kick | info). */
  function coachCandidates(m) {
    const c = [];
    const add = (tone, key, variants) => c.push({ tone, key, variants });
    const pct = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

    if (!m.totalWorkouts) {
      add('info', 'start', [
        'Tyhjä taulu. Ei dataa = ei tekosyitä. Paina Tänään-näkymässä ✓ Valmis jokaisen treenin jälkeen, niin kerron suoraan missä mennään.',
        'Kukaan ei tule hakemaan sinua sohvalta. Tee päivän treeni ja merkkaa se – sitten puhutaan edistymisestä.'
      ]);
    }
    if (m.daysSinceLast != null && m.daysSinceLast >= 4) {
      add('kick', 'idle', [
        `Viimeisin merkitty treeni ${m.daysSinceLast} päivää sitten. Sohva ei juokse maratonia puolestasi. Kiltteys on paskaa – liikettä tänään.`,
        `${m.daysSinceLast} päivää ilman treeniä. Vuorotyö ei ole tekosyy, se on olosuhde. Edes 20 min tänään.`
      ]);
    }
    // Viikkokilometrit
    if (m.km7 > 0 || m.kmPrev7 > 0) {
      const p = pct(m.km7, m.kmPrev7);
      if (m.kmPrev7 > 0 && p != null && p >= 40) {
        add('kick', 'km7-ramp', [
          `${fmt(m.km7)} km viime 7 päivänä, +${p} % edellisestä. Hyvä nälkä, mutta tyhmyys kostautuu: maltti, ettei polvi tai akilles sano sopimusta irti.`
        ]);
      } else if (m.kmPrev7 > 0 && p != null && p >= 10) {
        add('praise', 'km7-up', [
          `${fmt(m.km7)} km viime 7 päivänä – ${fmt(m.km7 - m.kmPrev7)} km enemmän kuin edellisellä viikolla. Tätä se on: vene kerrallaan.`,
          `Kilometrit nousussa: ${fmt(m.kmPrev7)} → ${fmt(m.km7)} km / 7 pv. Ei juhlita, jatketaan.`
        ]);
      } else if (m.kmPrev7 > 0 && p != null && p <= -30) {
        add('kick', 'km7-down', [
          `Viikkokilometrit romahti: ${fmt(m.kmPrev7)} → ${fmt(m.km7)} km. Jos syy on sairaus, lepää. Jos syy on mukavuus – nouse ylös.`,
          `${fmt(m.km7)} km viime 7 päivänä vs ${fmt(m.kmPrev7)} km sitä ennen. Maraton ei välitä tekosyistä.`
        ]);
      } else if (m.kmPrev7 === 0 && m.km7 > 0) {
        add('praise', 'km7-back', [`${fmt(m.km7)} km viime 7 päivänä. Liike on alkanut – nyt pidetään se käynnissä.`]);
      } else {
        add('info', 'km7-flat', [`${fmt(m.km7)} km viime 7 päivänä, edellinen viikko ${fmt(m.kmPrev7)} km. Tasaista. Tasainen on hyvä, kunhan se ei ole mukava.`]);
      }
    }
    // 4 viikon jakso
    if (m.kmPrev28 > 0 && m.km28 > 0) {
      const p = pct(m.km28, m.kmPrev28);
      if (p >= 10) add('praise', 'km28-up', [`4 viikon kilometrit ${fmt(m.kmPrev28)} → ${fmt(m.km28)} km (+${p} %). Pohja kasvaa. Turku lähestyy, ja sinä olet valmiimpi.`]);
      else if (p <= -25) add('kick', 'km28-down', [`4 viikon kilometrit laski ${fmt(m.kmPrev28)} → ${fmt(m.km28)} km (${p} %). Maratonkunto ei synny puolikkailla viikoilla. Takaisin rytmiin.`]);
    }
    // Pitkä lenkki
    if (m.long28 > 0 && m.longPrev28 > 0) {
      if (m.long28 > m.longPrev28 + 0.4) add('praise', 'long-up', [`Pisin lenkki nyt ${fmt(m.long28)} km – ${fmt(m.long28 - m.longPrev28)} km pidempi kuin edellisellä jaksolla. 32 km seinä kaadetaan juuri näin.`]);
      else if (m.long28 < m.longPrev28 * 0.75) add('kick', 'long-down', [`Pisin lenkki 4 viikkoon ${fmt(m.long28)} km, aiemmin ${fmt(m.longPrev28)} km. Pitkä lenkki on maratonin selkäranka – älä anna sen surkastua.`]);
    } else if (m.long28 >= 10) {
      add('praise', 'long-has', [`Pisin lenkki viimeiseen 4 viikkoon: ${fmt(m.long28)} km. Hyvä. Seuraava vähän pidempi, ei paljon.`]);
    }
    // Putki
    if (m.weekStreak >= 2) {
      add('praise', 'streak', [
        `${m.weekStreak} viikkoa putkeen vähintään 3 treeniä. Kurinalaisuus voittaa motivaation joka kerta. Älä katkaise ketjua.`,
        `Putki: ${m.weekStreak} viikkoa ≥3 treeniä. Kukaan ei näe näitä aamuja – siksi ne ratkaisee.`
      ]);
    }
    if (m.totalWorkouts && m.thisWeekCount === 0 && m.dowIndex >= 3) {
      add('kick', 'week-zero', ['Viikko on puolessa välissä ja treenejä nolla. Ei kokousta itsesi kanssa – tee tänään se mitä suunnitelmassa lukee.']);
    } else if (m.thisWeekCount >= 4) {
      add('praise', 'week-busy', [`${m.thisWeekCount} treeniä tällä viikolla. Hyvää työtä – ja muista että lepo on osa suunnitelmaa, ei palkinto.`]);
    }
    // Paino
    if (m.weightKg != null) {
      if (m.weightDelta != null) {
        const perWeek = (m.weightDelta / m.weightSpanDays) * 7;
        if (perWeek <= -0.9) {
          add('kick', 'w-fast', [`Paino ${fmt(m.weightRefKg)} → ${fmt(m.weightKg)} kg liian nopeasti (~${fmt(-perWeek)} kg/vk). Maratoonari ei treenaa tyhjällä tankilla – syö kunnolla, varsinkin hiilarit treenipäivinä.`]);
        } else if (m.weightDelta <= -0.3) {
          add('praise', 'w-down', [
            `Paino ${fmt(m.weightRefKg)} → ${fmt(m.weightKg)} kg (${fmt(m.weightDelta)} kg). Kevyempi runko = vähemmän iskua joka askeleella. Rauhallinen tahti, jatka.`,
            `${fmt(m.weightDelta)} kg sitten ${m.weightRefDate.slice(8, 10)}.${m.weightRefDate.slice(5, 7)}. Hyvä suunta – ei pikadieettejä, kilometrit hoitaa loput.`
          ]);
        } else if (m.weightDelta >= 1) {
          add('kick', 'w-up', [`Paino +${fmt(m.weightDelta)} kg (${fmt(m.weightRefKg)} → ${fmt(m.weightKg)} kg). Ei paniikkia, mutta rehellisyys: syöminen ja liike ei nyt täsmää. Korjaa se.`]);
        } else {
          add('info', 'w-flat', [`Paino pysyy ~${fmt(m.weightKg)} kg. Vakaa on hyvä – nyt kilometrit puhuu.`]);
        }
        if (m.weightFirstKg != null && m.weightFirstDate !== m.weightRefDate && m.weightKg <= m.weightFirstKg - 1) {
          add('praise', 'w-long', [`Pitkä linja: ${fmt(m.weightFirstKg)} → ${fmt(m.weightKg)} kg ${m.weightFirstDate.slice(8, 10)}.${m.weightFirstDate.slice(5, 7)}.${m.weightFirstDate.slice(0, 4)} lähtien. Hidas ja pysyvä voittaa nopean ja katoavan.`]);
        }
      }
      if (m.weighDaysAgo != null && m.weighDaysAgo > 40) {
        add('info', 'w-stale', [`Viimeisin paino ${m.weighDaysAgo} päivää sitten. Mitä ei mitata, sitä ei johdeta – lisää kuukausimerkintä.`]);
      }
    }
    return c;
  }

  /** Yksi viesti kerrallaan: vaihtuu päivittäin ja kun data muuttuu. offset = käyttäjän selaus. */
  function coachMessage(input, offset) {
    const m = progressMetrics(input || {});
    const list = coachCandidates(m);
    if (!list.length) {
      list.push({ tone: 'info', key: 'default', variants: ['Tee päivän treeni ja merkkaa se. Edistyminen ei ole fiilis, se on merkintä kerrallaan.'] });
    }
    const sig = [m.today, m.totalWorkouts, m.km28, m.weightKg, m.weightDate].join('|');
    const h = hashStr(sig);
    const i = (h + (offset || 0)) % list.length;
    const cand = list[i];
    const text = cand.variants[(h >>> 8) % cand.variants.length];
    return { tone: cand.tone, key: cand.key, text, index: i, count: list.length, metrics: m };
  }


  /* ---------- Juoksukilometrit: kuukausitavoitteet ja laskuri ---------- */
  const KM_SINCE = '2026-10-23';
  const KM_RACE_DATE = '2027-08-21';
  const KM_RACE_GOAL = 1500;
  const KM_SERIES_END = '2027-10-23';
  /** Kuukausitavoitteet (km/vk, km/kk, pisin lenkki). Lokakuu 2026 = aloitus, vain toteuma. */
  const KM_TARGETS = [
    { m: '2026-10', week: null, month: null, long: null, note: 'Aloitus 23.10. – vain toteuma' },
    { m: '2026-11', week: [22, 28], month: [100, 110], long: '11–13 km' },
    { m: '2026-12', week: [25, 30], month: [110, 120], long: '13–15 km' },
    { m: '2027-01', week: [28, 32], month: [125, 135], long: '14–16 km' },
    { m: '2027-02', week: [30, 35], month: [130, 145], long: '16–18 km' },
    { m: '2027-03', week: [33, 38], month: [145, 160], long: '18–20 km' },
    { m: '2027-04', week: [35, 40], month: [155, 170], long: '20–22 km' },
    { m: '2027-05', week: [38, 45], month: [165, 185], long: '22–25 km' },
    { m: '2027-06', week: [42, 50], month: [180, 200], long: '24–28 km', note: 'puolimaraton testinä' },
    { m: '2027-07', week: [45, 52], month: [190, 210], long: '28–32 km', note: 'huippu' },
    { m: '2027-08', week: null, weekText: 'taper + kisa 21.8.', month: [110, 120], long: '42,2 km', note: 'sis. maraton' },
    { m: '2027-09', week: [20, 30], month: [90, 120], long: null, note: 'palautus kohti 40-vuotispäivää' },
    { m: '2027-10', week: [20, 30], month: [90, 120], long: null, note: 'palautus kohti 40-vuotispäivää' }
  ];
  const KM_NOTE = 'Joka 4. viikko ~30 % kevyempi. Salibandy ja kävelyt tulevat näiden päälle.';

  function kmTargetFor(monthKeyStr) {
    return KM_TARGETS.find(function (t) { return t.m === monthKeyStr; }) || null;
  }
  function rangeText(r, prefix) {
    return r ? (prefix || '') + r[0] + '–' + r[1] : '';
  }
  function km1(x) { return Math.round((x || 0) * 100) / 100; }

  /**
   * Yhdistää Garminin kmStatsin (coach-plan.json) ja käsin kirjatut juoksut/hiihdot.
   * Käsin kirjattu (ei garminId) lasketaan vain, jos Garminilla ei ole saman lajin km:iä sille päivälle
   * → ei tuplalaskentaa. Jos kmStats puuttuu, lasketaan kaikki lokin juoksut.
   * opts: { kmStats, log, today: 'YYYY-MM-DD', logKind: fn(l) → 'run'|'ski'|… }
   */
  function kmSummary(opts) {
    const o = opts || {};
    const ks = o.kmStats || null;
    const today = o.today || (function () { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
    const kindOf = typeof o.logKind === 'function' ? o.logKind : function (l) { return l.kind || l.type; };
    const since = KM_SINCE;
    const months = {};
    const mon = function (k) {
      return months[k] || (months[k] = { km: 0, runs: 0, longest: 0, skiKm: 0, skiMin: 0, skis: 0, manualKm: 0, manualSkiKm: 0 });
    };
    if (ks && ks.months) {
      Object.keys(ks.months).forEach(function (k) {
        const g = ks.months[k] || {};
        const m = mon(k);
        m.km += g.km || 0; m.runs += g.runs || 0; m.longest = Math.max(m.longest, g.longest || 0);
        m.skiKm += g.skiKm || 0; m.skiMin += g.skiMin || 0; m.skis += g.skis || 0;
      });
    }
    const gDays = (ks && ks.days) || {};
    const gSkiDays = (ks && ks.skiDays) || {};
    // Garmin on totuus: päivät ennen viimeisintä Garmin-päivitystä (kmStats.updatedAt) on synkattu
    // → käsin ✓ Valmis -merkitty suunnitelman juoksu (suunniteltu km, ei mitattu) ei lisää km:iä niille.
    // Vasta synkkaamattomat päivät (päivityspäivä ja sen jälkeen) lasketaan käsin, jos Garminilla ei ole juoksua.
    const gCovered = ks && ks.complete !== false && /^\d{4}-\d{2}-\d{2}/.test(ks.updatedAt || '') ? ks.updatedAt.slice(0, 10) : '';
    const seen = {};
    let manualRuns = 0;
    (o.log || []).forEach(function (l) {
      if (!l || !l.date || l.date < since || l.date > today) return;
      const kind = kindOf(l);
      if (kind !== 'run' && kind !== 'ski') return; // kävely, kuntopiiri, salibandy ym. eivät ole juoksukm:iä
      const km = Number(l.distanceKm) || 0;
      if (!(km > 0)) return;
      if (ks && l.garminId) return;
      if (ks && kind === 'run' && gDays[l.date]) return;
      if (ks && kind === 'ski' && gSkiDays[l.date]) return;
      if (ks && gCovered && l.date < gCovered && !l.manualKm) return;
      // sama päivä + laji vain kerran (tuplat ✓ Valmis -painalluksista)
      const sk = l.date + '|' + kind;
      if (seen[sk]) return;
      seen[sk] = true;
      const m = mon(l.date.slice(0, 7));
      if (kind === 'run') { m.km += km; m.runs++; m.longest = Math.max(m.longest, km); m.manualKm += km; manualRuns++; }
      else { m.skiKm += km; m.skiMin += Number(l.minutes) || 0; m.skis++; m.manualSkiKm += km; }
    });
    const keys = Object.keys(months).sort();
    let totalKm = 0, raceKm = 0, skiKm = 0, skiMin = 0, runs = 0, skis = 0;
    keys.forEach(function (k) {
      const m = months[k];
      ['km', 'longest', 'skiKm', 'manualKm', 'manualSkiKm'].forEach(function (f) { m[f] = km1(m[f]); });
      m.skiMin = Math.round(m.skiMin);
      totalKm += m.km; skiKm += m.skiKm; skiMin += m.skiMin; runs += m.runs; skis += m.skis;
      if (k <= KM_RACE_DATE.slice(0, 7)) raceKm += m.km;
    });
    // Elokuu 2027: kisan jälkeiset juoksut (22.–31.8.) eivät kuulu 1500 km -tavoitteeseen
    if (months['2027-08']) {
      Object.keys(gDays).forEach(function (d) { if (d > KM_RACE_DATE && d.slice(0, 7) === '2027-08') raceKm -= gDays[d] || 0; });
    }
    const curKey = today.slice(0, 7);
    const cur = months[curKey] || { km: 0, runs: 0, longest: 0, skiKm: 0, skiMin: 0, skis: 0 };
    const target = kmTargetFor(curKey);
    const rows = KM_TARGETS.map(function (t) {
      const m = months[t.m] || null;
      return { m: t.m, target: t, km: m ? m.km : 0, longest: m ? m.longest : 0, skiKm: m ? m.skiKm : 0,
        skiMin: m ? m.skiMin : 0, past: t.m < curKey, current: t.m === curKey };
    });
    const raceGoalPct = Math.min(100, Math.round(raceKm / KM_RACE_GOAL * 1000) / 10);
    const monthPct = target && target.month ? Math.min(100, Math.round(cur.km / target.month[1] * 100)) : null;
    return {
      since: since, today: today, garmin: !!ks, garminUpdatedAt: ks ? ks.updatedAt || '' : '',
      totalKm: km1(totalKm), raceKm: km1(raceKm), raceGoal: KM_RACE_GOAL, raceDate: KM_RACE_DATE, raceGoalPct: raceGoalPct,
      seriesEnd: KM_SERIES_END, runs: runs, manualRuns: manualRuns,
      skiKm: km1(skiKm), skiMin: Math.round(skiMin), skis: skis, aerobicKm: km1(totalKm + skiKm),
      current: { m: curKey, km: cur.km, longest: cur.longest, skiKm: cur.skiKm, skiMin: cur.skiMin, target: target, pct: monthPct },
      months: months, rows: rows, note: KM_NOTE
    };
  }

  function formatSkiTime(min) {
    const m = Math.round(min || 0);
    if (!m) return '';
    const h = Math.floor(m / 60);
    return h ? h + ' h ' + (m % 60) + ' min' : m + ' min';
  }


  global.TreeniProgress = {
    MONTH_FI,
    PHOTO_SOFT_LIMIT,
    DEFAULT_COMPRESS,
    monthKey,
    formatMonthFi,
    sortEntriesDesc,
    groupByMonth,
    weightDelta,
    formatWeightDelta,
    estimateDataUrlBytes,
    totalPhotoBytes,
    overPhotoSoftLimit,
    pickCompareEntry,
    primaryPhoto,
    compressImageFile,
    normalizeEntry,
    averageMetric,
    progressMetrics,
    coachCandidates,
    coachMessage,
    KM_SINCE,
    KM_RACE_DATE,
    KM_RACE_GOAL,
    KM_SERIES_END,
    KM_TARGETS,
    KM_NOTE,
    kmTargetFor,
    rangeText,
    kmSummary,
    formatSkiTime
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
