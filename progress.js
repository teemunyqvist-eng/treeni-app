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
    coachMessage
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
