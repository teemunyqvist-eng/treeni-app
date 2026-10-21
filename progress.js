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
      photos: Array.isArray(raw.photos) ? raw.photos.slice(0, 2).map((p) => ({
        id: p.id || ('ph' + Math.random().toString(36).slice(2, 8)),
        dataUrl: p.dataUrl,
        kind: p.kind === 'side' ? 'side' : (p.kind === 'front' ? 'front' : 'front')
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

  /**
   * RHR/HRV-trendi kuukausimerkinnöistä (uusimmat ensin suositeltu).
   * elevated RHR = viimeisimmät > aiempi keskiarvo + kynnys.
   */
  function rhrHrvTrend(entries, opts) {
    opts = opts || {};
    const threshold = opts.rhrRiseThreshold != null ? opts.rhrRiseThreshold : 4;
    const sorted = sortEntriesDesc(entries).filter(Boolean);
    const withHr = sorted.filter((e) => e.restingHr != null && !isNaN(+e.restingHr));
    const withHrv = sorted.filter((e) => e.hrv != null && !isNaN(+e.hrv));

    const result = {
      latestRhr: withHr.length ? +withHr[0].restingHr : null,
      latestHrv: withHrv.length ? +withHrv[0].hrv : null,
      prevAvgRhr: null,
      rhrDelta: null,
      elevatedRhr: false,
      hrvDelta: null,
      softSuggestion: null,
      sampleRhr: withHr.length,
      sampleHrv: withHrv.length
    };

    if (withHr.length >= 2) {
      // Uusin 1–2 vs aiempi keskiarvo (ei päällekkäin)
      const recentN = withHr.length >= 4 ? 2 : 1;
      const recent = withHr.slice(0, recentN);
      const older = withHr.slice(recentN);
      const recentAvg = recent.reduce((s, e) => s + +e.restingHr, 0) / recent.length;
      const baseAvg = older.length
        ? older.reduce((s, e) => s + +e.restingHr, 0) / older.length
        : +withHr[withHr.length - 1].restingHr;
      result.prevAvgRhr = Math.round(baseAvg * 10) / 10;
      result.rhrDelta = Math.round((recentAvg - baseAvg) * 10) / 10;
      result.elevatedRhr = result.rhrDelta >= threshold;
    } else if (withHr.length === 1) {
      result.prevAvgRhr = +withHr[0].restingHr;
      result.rhrDelta = 0;
    }

    if (withHrv.length >= 2) {
      result.hrvDelta = Math.round((+withHrv[0].hrv - +withHrv[1].hrv) * 10) / 10;
    }

    if (result.elevatedRhr) {
      result.softSuggestion =
        'Leposyke nousussa (+' + result.rhrDelta + ' vs aiempi). ' +
        'Kevennä laatua tänään – helppo / liikkuvuus / minimi-paketti.';
    } else if (result.hrvDelta != null && result.hrvDelta <= -10 && result.latestHrv != null) {
      result.softSuggestion =
        'HRV laskenut (' + result.hrvDelta + '). Suosi kevyttä treeniä ja unta.';
    }
    return result;
  }

  function averageMetric(entries, key) {
    const vals = (entries || [])
      .map((e) => e[key])
      .filter((v) => v != null && !isNaN(+v))
      .map(Number);
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
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
    rhrHrvTrend,
    averageMetric
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
