/**
 * Centralized Prakriti (Vata/Pitta/Kapha) Normalization & Input Validation Engine
 * AyurTrace / AIIA CTMS
 */

/**
 * Normalizes raw Vata, Pitta, and Kapha scores into percentages summing to 100%.
 * Validates inputs to ensure non-negativity and complete data entry.
 *
 * @param {number|string|null} vInput - Vata value
 * @param {number|string|null} pInput - Pitta value
 * @param {number|string|null} kInput - Kapha value
 * @returns {Object} Validation & normalization result
 */
function normalizePrakriti(vInput, pInput, kInput) {
  const isVEmpty = vInput === null || vInput === undefined || String(vInput).trim() === '';
  const isPEmpty = pInput === null || pInput === undefined || String(pInput).trim() === '';
  const isKEmpty = kInput === null || kInput === undefined || String(kInput).trim() === '';

  // Case 1: All empty/null
  if (isVEmpty && isPEmpty && isKEmpty) {
    return {
      valid: true,
      empty: true,
      raw: { vata: null, pitta: null, kapha: null },
      normalized: { vataPct: null, pittaPct: null, kaphaPct: null },
      totalRaw: null,
      totalPct: null
    };
  }

  // Case 2: Incomplete assessment (some present, some missing)
  if (isVEmpty || isPEmpty || isKEmpty) {
    return {
      valid: false,
      empty: false,
      issue: 'Incomplete Prakriti assessment: all three doshic scores (Vata, Pitta, Kapha) must be entered together',
      severity: 'Major'
    };
  }

  const v = Number(vInput);
  const p = Number(pInput);
  const k = Number(kInput);

  // Case 3: Invalid numeric check (NaN, Infinity, negative values)
  if (!Number.isFinite(v) || !Number.isFinite(p) || !Number.isFinite(k) || v < 0 || p < 0 || k < 0) {
    return {
      valid: false,
      empty: false,
      issue: `Invalid Prakriti score (V:${vInput}, P:${pInput}, K:${kInput}) - values must be non-negative numbers`,
      severity: 'Major'
    };
  }

  const totalRaw = v + p + k;

  // Case 4: All zero (Total = 0)
  if (totalRaw === 0) {
    return {
      valid: true,
      empty: false,
      raw: { vata: 0, pitta: 0, kapha: 0 },
      normalized: { vataPct: 0, pittaPct: 0, kaphaPct: 0 },
      totalRaw: 0,
      totalPct: 0
    };
  }

  // Case 5: Normalization using Hamilton-Hare / Largest-Remainder Method
  const scaledV = (v * 10000) / totalRaw;
  const scaledP = (p * 10000) / totalRaw;
  const scaledK = (k * 10000) / totalRaw;

  const floorV = Math.floor(scaledV);
  const floorP = Math.floor(scaledP);
  const floorK = Math.floor(scaledK);

  let remainder = 10000 - (floorV + floorP + floorK);

  const items = [
    { key: 'vata', floor: floorV, frac: scaledV - floorV, order: 0 },
    { key: 'pitta', floor: floorP, frac: scaledP - floorP, order: 1 },
    { key: 'kapha', floor: floorK, frac: scaledK - floorK, order: 2 }
  ];

  // Sort descending by fractional part. If tie, prefer kapha (order 2), pitta (order 1), vata (order 0)
  items.sort((a, b) => {
    if (Math.abs(b.frac - a.frac) > 1e-9) {
      return b.frac - a.frac;
    }
    return b.order - a.order;
  });

  for (let i = 0; i < remainder; i++) {
    items[i].floor += 1;
  }

  const res = {};
  for (const item of items) {
    res[item.key] = Number((item.floor / 100).toFixed(2));
  }

  return {
    valid: true,
    empty: false,
    raw: { vata: v, pitta: p, kapha: k },
    normalized: {
      vataPct: res.vata,
      pittaPct: res.pitta,
      kaphaPct: res.kapha
    },
    totalRaw,
    totalPct: Number((res.vata + res.pitta + res.kapha).toFixed(2)) // Guaranteed 100.00
  };
}

/**
 * Helper to format Prakriti display string for API responses or UI rendering.
 * e.g., "40% / 35% / 25%" or "33.33% / 33.33% / 33.34%"
 */
function formatPrakritiDisplay(v, p, k) {
  const norm = normalizePrakriti(v, p, k);
  if (!norm.valid || norm.empty || !norm.normalized) return null;
  return `${norm.normalized.vataPct}% / ${norm.normalized.pittaPct}% / ${norm.normalized.kaphaPct}%`;
}

module.exports = {
  normalizePrakriti,
  formatPrakritiDisplay
};
