import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line,
  CartesianGrid, ReferenceLine, Cell, ComposedChart, Scatter, ScatterChart, ZAxis,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */
const C = {
  ink: "#0E2129",
  ink2: "#132C36",
  surface: "#173741",
  surface2: "#1D434F",
  line: "#2A5867",
  dim: "#7EA3AF",
  text: "#E6F2F5",
  brass: "#E3B25C",
  water: "#4FBEDC",
  electrolyte: "#63D6A8",
  caffeine: "#E0932F",
  alcohol: "#CB6272",
  other: "#8E9BD9",
  flag: "#FF7A5C",
};

const CATS = [
  { id: "water", label: "Water", color: C.water, subs: ["plain water", "sparkling", "ice water"] },
  { id: "electrolyte", label: "Electrolytes", color: C.electrolyte, subs: ["electrolyte mix", "LMNT", "sports drink", "coconut water"] },
  { id: "caffeine", label: "Caffeine", color: C.caffeine, subs: ["tea black", "tea green", "tea oolong", "coffee", "espresso", "yerba mate"] },
  { id: "alcohol", label: "Alcohol", color: C.alcohol, subs: ["beer", "wine", "spirits", "cocktail", "mojito", "hard seltzer"] },
  { id: "other", label: "Other", color: C.other, subs: ["decaf tea", "herbal tea", "juice", "milk", "broth", "soda"] },
];
const catOf = (id) => CATS.find((c) => c.id === id) || CATS[0];

// How much of an alcoholic drink's volume actually counts toward fluid.
// Beer 12 oz -> +8, wine 5 oz -> 0, spirits 1.5 oz neat -> -1. Editable in Settings.
const DEFAULT_ALC_NET = {
  beer: 0.67, "hard seltzer": 0.67, wine: 0, cocktail: 0.4, mojito: 0.4,
  spirits: -0.67, whiskey: -0.67,
};
const netFactor = (sub, map) => {
  const m = { ...DEFAULT_ALC_NET, ...(map || {}) };
  return m[sub] != null ? m[sub] : 0;
};
const netOz = (oz, sub, map) => Math.round(oz * netFactor(sub, map) * 10) / 10;
const signed = (n) => `${n > 0 ? "+" : n < 0 ? "\u2212" : ""}${Math.abs(n)}`;

const CONTAINERS = [
  { id: "shot2", oz: 2, kind: "shot", label: "Shot glass" },
  { id: "wine5", oz: 5, kind: "wine", label: "Wine glass" },
  { id: "cup8", oz: 8, kind: "paper", label: "Coffee cup" },
  { id: "cup12", oz: 12, kind: "paper", label: "Coffee cup" },
  { id: "pint16", oz: 16, kind: "pint", label: "Pint glass" },
  { id: "mug16", oz: 16, kind: "mug", label: "Closed mug" },
  { id: "mug20", oz: 20, kind: "mug", label: "Closed mug" },
  { id: "bottle24", oz: 24, kind: "bottle", label: "Water bottle" },
  { id: "cup28", oz: 28, kind: "tumbler", label: "Large cup" },
];
// Alcohol pours come in small glasses, so lead with those when that's the category.
const ALC_FIRST = ["shot2", "wine5", "pint16", "cup12", "cup8", "mug16", "mug20", "bottle24", "cup28"];
const containersFor = (cat) =>
  cat === "alcohol"
    ? ALC_FIRST.map((id) => CONTAINERS.find((c) => c.id === id))
    : [...CONTAINERS.filter((c) => c.oz >= 8), ...CONTAINERS.filter((c) => c.oz < 8)];

const CRAMP_LEVELS = ["None", "Slight", "Moderate", "Severe"];
const EXERTION = ["Rest", "L", "M", "H"];
const EXERTION_LABEL = { Rest: "Rest", L: "Low", M: "Moderate", H: "High" };

/* ------------------------------------------------------------------ */
/* Date + math helpers                                                 */
/* ------------------------------------------------------------------ */
const pad = (n) => String(n).padStart(2, "0");
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const shiftKey = (k, n) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
const shortDate = (k) => fromKey(k).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
const weekday = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: "short" });
const longDate = (k) => fromKey(k).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const hm12 = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${ap}`;
};
const toDec = (t) => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h + m / 60; };
const decToLabel = (v) => { if (v == null) return "—"; const h = Math.floor(v); return hm12(`${pad(h)}:${pad(Math.round((v - h) * 60))}`); };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ------------------------------------------------------------------ */
/* Optional seed days                                                  */
/* ------------------------------------------------------------------ */
/* Ships empty on purpose: this file is the public part of the project, and a
   log of what you drank and how you felt isn't public information. To bring a
   log in, use Settings -> Restore from a backup file. To bake days in for a
   demo, add rows here in this shape:
   { date: "2026-08-21", creatine: 0, water: 28, elec: 24, caff: 8,
     caffSub: "tea oolong", caffEnd: "09:00", alc: [[12, "beer"]],
     alcTime: "19:30", other: 20, otherSub: "decaf tea", symptoms: "Normal",
     cramping: "None", workout: "None", exertion: "Rest" } */
const SEED_ROWS = [
];

// Split an ounce total into realistic container-sized pours.
function chunk(oz) {
  const sizes = [28, 24, 20, 16, 12, 8];
  const out = [];
  let left = oz;
  while (left >= 8) {
    const s = sizes.find((x) => x <= left) || 8;
    out.push(s);
    left -= s;
  }
  if (left > 0) out.push(left);
  return out;
}
function spread(count, startH, endH) {
  if (count <= 1) return [startH];
  const step = (endH - startH) / (count - 1);
  return Array.from({ length: count }, (_, i) => startH + i * step);
}
const hToHM = (h) => `${pad(Math.max(0, Math.min(23, Math.floor(h))))}:${pad(Math.round((h - Math.floor(h)) * 60) % 60)}`;

function dayFromRow(row) {
  const entries = [];
  const push = (oz, cat, sub, t) => { if (oz > 0) entries.push({ id: uid(), oz: Math.round(oz * 10) / 10, cat, sub, t }); };

  const w = chunk(row.water || 0);
  spread(w.length, 6.5, 20.5).forEach((h, i) => push(w[i], "water", "plain water", hToHM(h)));

  const e = chunk(row.elec || 0);
  spread(e.length, 8, 17).forEach((h, i) => push(e[i], "electrolyte", "electrolyte mix", hToHM(h)));

  // One caffeine total may cover several teas; split it evenly and back-time from the finish.
  const caffSubs = String(row.caffSub || "tea").split(/[;|]/).map((x) => x.trim()).filter(Boolean);
  const endH = toDec(row.caffEnd) != null ? toDec(row.caffEnd) : 10;
  const perSub = (row.caff || 0) / Math.max(1, caffSubs.length);
  let slot = 0;
  caffSubs.forEach((cs) => {
    chunk(perSub).forEach((oz) => { push(oz, "caffeine", cs || "tea", hToHM(Math.max(5, endH - slot * 1.25))); slot += 1; });
  });

  const alcStart = toDec(row.alcTime) != null ? toDec(row.alcTime) : 19;
  (row.alc || []).forEach(([oz, sub], i) => push(oz, "alcohol", sub || "alcohol", hToHM(alcStart + i * 0.75)));

  const o = chunk(row.other || 0);
  const otherSubs = String(row.otherSub || "other").split(/[;|]/).map((x) => x.trim()).filter(Boolean);
  spread(o.length, 14, 21).forEach((h, i) => push(o[i], "other", otherSubs[Math.min(i, otherSubs.length - 1)] || "other", hToHM(h)));

  entries.sort((a, b) => a.t.localeCompare(b.t));
  return {
    entries,
    creatine: Number(row.creatine || 0),
    symptoms: row.symptoms || "",
    cramping: row.cramping || "None",
    crampNote: row.crampNote || "",
    workout: row.workout || "",
    exertion: row.exertion || "Rest",
    approxTimes: true,
  };
}

function buildSeed() {
  const days = {};
  SEED_ROWS.forEach((row) => { days[row.date] = { ...dayFromRow(row), seeded: true }; });
  return days;
}

/* ------------------------------------------------------------------ */
/* CSV import                                                          */
/* ------------------------------------------------------------------ */
/* Reads the spreadsheet layout (one row per day) whether it arrives as a file
   or pasted straight out of Excel or Sheets, which pastes tab-separated. */

function splitRows(text) {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const first = clean.split("\n")[0] || "";
  const delim = first.includes("\t") ? "\t" : first.split(";").length > first.split(",").length ? ";" : ",";
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}
const isBlankRow = (r) => r.every((c) => String(c).trim() === "");

const normHead = (h) => String(h).toLowerCase().replace(/[^a-z0-9]/g, "");
const HEAD_ALIASES = {
  date: ["date", "day"],
  creatine: ["creatineamountgrams", "creatineamount", "creatineg", "creatinegrams", "creatine"],
  water: ["waterconsumedoz", "wateroz", "water"],
  elec: ["electrolytesconsumedoz", "electrolytesoz", "electrolyteoz", "electrolytes", "electrolyte"],
  caff: ["caffeineconsumedoz", "caffeineoz", "caffeine"],
  caffSub: ["caffeinetype", "caffeinetypes"],
  caffEnd: ["caffeinetimefinished", "caffeinefinished", "caffeinetime", "lastcaffeine"],
  alcOz: ["alcoholconsumedoz", "alcoholpouredoz", "alcoholoz", "alcohol"],
  alcSub: ["alcoholtype", "alcoholtypes"],
  alcTime: ["alcoholtime", "alcoholtimestarted"],
  other: ["otherliquidsconsumedoz", "otherliquidsoz", "otheroz", "other"],
  otherSub: ["otherliquidstypes", "otherliquidstype", "othertypes", "othertype"],
  symptoms: ["symptoms", "symptom"],
  cramping: ["cramping", "cramps", "cramp"],
  workout: ["workouttypeactivity", "workouttype", "workoutactivity", "workout", "activity"],
  exertion: ["workoutexertionhmlrest", "workoutexertion", "exertion"],
  total: ["totalliquids", "totalliquidsnoalcohol", "totaloz", "total"],
};

function mapHeaders(headerRow) {
  const map = {};
  headerRow.forEach((h, i) => {
    const n = normHead(h);
    for (const field of Object.keys(HEAD_ALIASES)) {
      if (map[field] != null) continue;
      if (HEAD_ALIASES[field].includes(n)) { map[field] = i; break; }
    }
  });
  return map;
}

function parseImportDate(raw) {
  const v = String(raw || "").trim();
  if (!v) return null;
  const iso = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(+iso[2])}-${pad(+iso[3])}`;
  const mdy = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (mdy) {
    let y = +mdy[3];
    if (y < 100) y += 2000;
    const m = +mdy[1], d = +mdy[2];
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  const loose = new Date(v);
  return isNaN(loose) ? null : toKey(loose);
}

function parseImportTime(raw) {
  const v = String(raw || "").trim();
  if (!v || /^(na|n\/a|none|-)$/i.test(v)) return null;
  const m = v.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])?\.?m?\.?$/i);
  if (!m) return null;
  let h = +m[1];
  const min = m[2] ? +m[2] : 0;
  const ap = m[3] ? m[3].toLowerCase() : null;
  if (ap === "p" && h < 12) h += 12;
  if (ap === "a" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

const parseNum = (raw) => {
  const n = parseFloat(String(raw || "").replace(/[^0-9.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};

function parseCramping(raw) {
  const v = String(raw || "").trim();
  if (!v || /^(none|no|n|normal|0)$/i.test(v)) return { cramping: "None", note: "" };
  const hit = CRAMP_LEVELS.find((l) => l !== "None" && v.toLowerCase().includes(l.toLowerCase()));
  // "Slight, left calf overnight" keeps the detail; "Slight cramping" has none to keep.
  const note = hit
    ? v.replace(new RegExp(hit, "i"), "").replace(/cramping|cramps|cramp/gi, "").replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, "").trim()
    : v;
  return { cramping: hit || "Slight", note };
}

function parseExertion(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (!v || v.startsWith("rest") || v === "none" || v === "r") return "Rest";
  if (v.startsWith("h")) return "H";
  if (v.startsWith("m")) return "M";
  if (v.startsWith("l")) return "L";
  return "Rest";
}

// "12; 6" with "beer; mojito" becomes [[12,"beer"],[6,"mojito"]].
function pairAmounts(ozCell, typeCell) {
  const amounts = String(ozCell || "").split(/[;|]/).map((x) => parseNum(x)).filter((n) => n > 0);
  const types = String(typeCell || "").split(/[;|]/).map((x) => x.trim()).filter(Boolean);
  if (!amounts.length) return [];
  if (types.length <= 1) return amounts.map((oz) => [oz, types[0] || "alcohol"]);
  if (amounts.length === 1 && types.length > 1) {
    const each = Math.round((amounts[0] / types.length) * 10) / 10;
    return types.map((t) => [each, t]);
  }
  return amounts.map((oz, i) => [oz, types[Math.min(i, types.length - 1)]]);
}

function parseIntakeCSV(text) {
  const rows = splitRows(text);
  if (rows.filter((r) => !isBlankRow(r)).length < 2) return { days: {}, notes: [], errors: [{ line: 1, message: "Needs a header row and at least one day." }] };
  const map = mapHeaders(rows[0]);
  if (map.date == null) {
    return { days: {}, notes: [], errors: [{ line: 1, message: "No Date column found. The first row must be your column headings." }] };
  }
  const cell = (r, f) => (map[f] != null ? r[map[f]] : "");
  const days = {}, errors = [], notes = [];

  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (isBlankRow(r)) return;
    const key = parseImportDate(cell(r, "date"));
    if (!key) {
      if (String(cell(r, "date") || "").trim()) errors.push({ line, message: `Couldn't read the date "${String(cell(r, "date")).trim()}".` });
      return;
    }
    const cramp = parseCramping(cell(r, "cramping"));
    const row = {
      date: key,
      creatine: parseNum(cell(r, "creatine")),
      water: parseNum(cell(r, "water")),
      elec: parseNum(cell(r, "elec")),
      caff: parseNum(cell(r, "caff")),
      caffSub: cell(r, "caffSub") || "tea",
      caffEnd: parseImportTime(cell(r, "caffEnd")),
      alc: pairAmounts(cell(r, "alcOz"), cell(r, "alcSub")),
      alcTime: parseImportTime(cell(r, "alcTime")),
      other: parseNum(cell(r, "other")),
      otherSub: cell(r, "otherSub") || "other",
      symptoms: String(cell(r, "symptoms") || "").trim(),
      cramping: cramp.cramping,
      crampNote: cramp.note,
      workout: String(cell(r, "workout") || "").trim(),
      exertion: parseExertion(cell(r, "exertion")),
    };
    const built = dayFromRow(row);
    if (!built.entries.length) { errors.push({ line, message: `${shortDate(key)} has no ounces in any column.` }); return; }
    days[key] = built;

    if (map.total != null) {
      const stated = parseNum(cell(r, "total"));
      const computed = row.water + row.elec + row.caff + row.other;
      if (stated > 0 && Math.abs(stated - computed) > 2) {
        notes.push(`${shortDate(key)}: your Total column says ${stated} oz, the individual columns add to ${computed}. Using the columns.`);
      }
    }
    if (row.caff > 0 && !row.caffEnd) notes.push(`${shortDate(key)}: no caffeine finish time, so it was placed mid-morning.`);
    if (row.alc.length && !row.alcTime) notes.push(`${shortDate(key)}: no alcohol time, so it was placed at 7 PM.`);
  });

  return { days, notes, errors };
}

const blankDay = () => ({ entries: [], creatine: 0, symptoms: "", cramping: "None", crampNote: "", workout: "", exertion: "Rest" });

/* ------------------------------------------------------------------ */
/* Derived metrics                                                     */
/* ------------------------------------------------------------------ */
function dayStats(key, day, netMap) {
  const s = { key, water: 0, electrolyte: 0, caffeine: 0, alcohol: 0, other: 0 };
  (day.entries || []).forEach((e) => { s[e.cat] = (s[e.cat] || 0) + Number(e.oz || 0); });
  s.tracked = s.water + s.electrolyte + s.caffeine + s.other; // matches the sheet's "Total liquids"
  s.alcNet = Math.round(
    (day.entries || []).filter((e) => e.cat === "alcohol")
      .reduce((a, e) => a + Number(e.oz || 0) * netFactor(e.sub, netMap), 0) * 10
  ) / 10;
  s.netTotal = Math.round((s.tracked + s.alcNet) * 10) / 10;
  s.all = s.tracked + s.alcohol;
  s.elecPct = s.netTotal > 0 ? (s.electrolyte / s.netTotal) * 100 : 0;
  s.waterPerElec = s.electrolyte ? s.water / s.electrolyte : null;
  const caff = (day.entries || []).filter((e) => e.cat === "caffeine");
  s.lastCaffeine = caff.length ? toDec(caff.map((e) => e.t).sort().slice(-1)[0]) : null;
  const alc = (day.entries || []).filter((e) => e.cat === "alcohol");
  s.firstAlcohol = alc.length ? toDec(alc.map((e) => e.t).sort()[0]) : null;
  const times = (day.entries || []).map((e) => toDec(e.t)).filter((x) => x != null);
  s.firstSip = times.length ? Math.min(...times) : null;
  s.lastSip = times.length ? Math.max(...times) : null;
  // how much of the day's fluid landed before 2pm
  s.beforeNoon = times.length
    ? ((day.entries.filter((e) => toDec(e.t) < 14).reduce((a, e) => a + Number(e.oz), 0)) / (s.all || 1)) * 100
    : 0;
  s.creatine = Number(day.creatine || 0);
  s.crampLevel = CRAMP_LEVELS.indexOf(day.cramping || "None");
  s.cramping = day.cramping || "None";
  s.exertion = day.exertion || "Rest";
  s.workout = day.workout || "";
  s.symptoms = day.symptoms || "";
  s.entries = day.entries || [];
  return s;
}

/* ------------------------------------------------------------------ */
/* Container artwork                                                   */
/* ------------------------------------------------------------------ */
function ContainerIcon({ kind, color, size = 46 }) {
  const stroke = color;
  const fill = "none";
  const common = { fill, stroke, strokeWidth: 2.4, strokeLinejoin: "round", strokeLinecap: "round" };
  const wash = { fill: color, opacity: 0.16 };
  return (
    <svg viewBox="0 0 44 56" width={size} height={size * (56 / 44)} aria-hidden="true">
      {kind === "paper" && (
        <g>
          <path d="M11 15 L14 47 Q14.4 51 18.4 51 L25.6 51 Q29.6 51 30 47 L33 15 Z" {...wash} stroke="none" />
          <path d="M11 15 L14 47 Q14.4 51 18.4 51 L25.6 51 Q29.6 51 30 47 L33 15 Z" {...common} />
          <path d="M9 9 L35 9 L33.6 15 L10.4 15 Z" {...common} />
          <path d="M12.6 27 L31.4 27" stroke={stroke} strokeWidth="1.6" opacity="0.5" />
        </g>
      )}
      {kind === "pint" && (
        <g>
          <path d="M12 8 L16 47 Q16.3 51 20 51 L24 51 Q27.7 51 28 47 L32 8 Z" {...wash} stroke="none" />
          <path d="M12 8 L16 47 Q16.3 51 20 51 L24 51 Q27.7 51 28 47 L32 8 Z" {...common} />
          <path d="M13.4 21 L30.6 21" stroke={stroke} strokeWidth="1.6" opacity="0.5" />
        </g>
      )}
      {kind === "mug" && (
        <g>
          <rect x="12" y="14" width="20" height="37" rx="6" {...wash} stroke="none" />
          <rect x="12" y="14" width="20" height="37" rx="6" {...common} />
          <path d="M14 8 L30 8 Q32 8 32 10.5 L32 14 L12 14 L12 10.5 Q12 8 14 8 Z" {...common} />
          <path d="M21 4.5 L23 4.5" {...common} />
          <path d="M32 22 Q39 24 39 30 Q39 36 32 38" {...common} />
          <path d="M14.5 44 L29.5 44" stroke={stroke} strokeWidth="1.6" opacity="0.45" />
        </g>
      )}
      {kind === "bottle" && (
        <g>
          <path d="M13 21 Q13 17 16 15 L16 10 L28 10 L28 15 Q31 17 31 21 L31 47 Q31 51 27 51 L17 51 Q13 51 13 47 Z" {...wash} stroke="none" />
          <path d="M13 21 Q13 17 16 15 L16 10 L28 10 L28 15 Q31 17 31 21 L31 47 Q31 51 27 51 L17 51 Q13 51 13 47 Z" {...common} />
          <path d="M15.4 5 L28.6 5 L28.6 10 L15.4 10 Z" {...common} />
          <path d="M14.6 30 L21 30 M14.6 37 L21 37" stroke={stroke} strokeWidth="1.6" opacity="0.5" />
        </g>
      )}
      {kind === "shot" && (
        <g>
          <path d="M15 26 L17 47 Q17.3 51 21 51 L23 51 Q26.7 51 27 47 L29 26 Z" {...wash} stroke="none" />
          <path d="M15 26 L17 47 Q17.3 51 21 51 L23 51 Q26.7 51 27 47 L29 26 Z" {...common} />
          <path d="M16 34 L28 34" stroke={stroke} strokeWidth="1.6" opacity="0.5" />
        </g>
      )}
      {kind === "wine" && (
        <g>
          <path d="M13 8 Q13 26 22 30 Q31 26 31 8 Z" {...wash} stroke="none" />
          <path d="M13 8 Q13 26 22 30 Q31 26 31 8 Z" {...common} />
          <path d="M22 30 L22 45" {...common} />
          <path d="M15 49 Q22 45.5 29 49" {...common} />
          <path d="M14.4 18 Q22 22 29.6 18" stroke={stroke} strokeWidth="1.6" opacity="0.5" fill="none" />
        </g>
      )}
      {kind === "tumbler" && (
        <g>
          <path d="M11 13 L14.5 47 Q14.9 51 18.9 51 L25.1 51 Q29.1 51 29.5 47 L33 13 Z" {...wash} stroke="none" />
          <path d="M11 13 L14.5 47 Q14.9 51 18.9 51 L25.1 51 Q29.1 51 29.5 47 L33 13 Z" {...common} />
          <path d="M9.5 13 L34.5 13" {...common} />
          <path d="M26 13 L31 3" {...common} />
          <path d="M13 26 L31 26" stroke={stroke} strokeWidth="1.6" opacity="0.45" />
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* The day vessel — signature element                                  */
/* ------------------------------------------------------------------ */
function DayVessel({ stats, goal }) {
  const W = 132, H = 236, top = 10, bot = 214;
  const order = ["water", "electrolyte", "caffeine", "other"];
  const scaleMax = Math.max(goal, stats.netTotal, stats.tracked, 16);
  const usable = bot - top;
  let cursor = bot;
  const bands = order.map((cat) => {
    const oz = stats[cat] || 0;
    const h = (oz / scaleMax) * usable;
    cursor -= h;
    return { cat, oz, y: cursor, h, color: catOf(cat).color };
  });
  const trackedTop = cursor;
  if (stats.alcNet > 0) {
    const h = (stats.alcNet / scaleMax) * usable;
    cursor -= h;
    bands.push({ cat: "alcohol", oz: stats.alcNet, y: cursor, h, color: C.alcohol });
  }
  const deficit = stats.alcNet < 0 ? { y: trackedTop, h: (Math.abs(stats.alcNet) / scaleMax) * usable } : null;
  const goalY = bot - (goal / scaleMax) * usable;
  const ticks = [];
  for (let v = 16; v <= scaleMax; v += 16) ticks.push({ v, y: bot - (v / scaleMax) * usable });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 200 }} role="img"
      aria-label={`${Math.round(stats.netTotal)} net ounces today`}>
      <defs>
        <pattern id="deficitHatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={C.flag} strokeWidth="2.4" opacity="0.45" />
        </pattern>
        <clipPath id="vesselClip">
          <path d="M24 8 L33 196 Q34 214 52 214 L80 214 Q98 214 99 196 L108 8 Z" />
        </clipPath>
      </defs>
      <path d="M24 8 L33 196 Q34 214 52 214 L80 214 Q98 214 99 196 L108 8 Z" fill={C.ink} stroke={C.line} strokeWidth="2" />
      <g clipPath="url(#vesselClip)">
        {bands.map((b) => b.h > 0 && (
          <rect key={b.cat} x="18" width="100" y={b.y} height={b.h} fill={b.color}
            opacity={b.cat === "alcohol" ? 0.55 : 0.82}
            style={{ transition: "y .45s cubic-bezier(.4,0,.2,1), height .45s cubic-bezier(.4,0,.2,1)" }} />
        ))}
        {bands.filter((b) => b.h > 0).map((b) => (
          <rect key={b.cat + "l"} x="18" width="100" y={b.y} height="1.6" fill={C.ink} opacity="0.35" />
        ))}
        {deficit && deficit.h > 0 && (
          <g>
            <rect x="18" width="100" y={deficit.y} height={deficit.h} fill={C.ink} />
            <rect x="18" width="100" y={deficit.y} height={deficit.h} fill="url(#deficitHatch)" />
            <rect x="18" width="100" y={deficit.y} height="1.6" fill={C.flag} opacity="0.8" />
          </g>
        )}
      </g>
      <g>
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1="30" x2="44" y1={t.y} y2={t.y} stroke={C.dim} strokeWidth="1.4" opacity="0.55" />
            <text x="48" y={t.y + 4} fontSize="10" fill={C.dim} className="mono">{t.v}</text>
          </g>
        ))}
        <line x1="26" x2="106" y1={goalY} y2={goalY} stroke={C.brass} strokeWidth="1.6" strokeDasharray="4 3" />
        <text x="108" y={goalY + 4} fontSize="9.5" fill={C.brass} className="mono" textAnchor="end" opacity="0.9">goal</text>
      </g>
      <path d="M24 8 L33 196 Q34 214 52 214 L80 214 Q98 214 99 196 L108 8 Z" fill="none" stroke={C.line} strokeWidth="2" />
      <path d="M20 6 L112 6" stroke={C.line} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
const Card = ({ title, note, children, right }) => (
  <section className="card">
    {(title || right) && (
      <header className="cardHead">
        <div>
          <h2 className="cardTitle">{title}</h2>
          {note && <p className="cardNote">{note}</p>}
        </div>
        {right}
      </header>
    )}
    {children}
  </section>
);

const Segmented = ({ options, value, onChange, colorize }) => (
  <div className="seg" role="group">
    {options.map((o) => {
      const v = typeof o === "string" ? o : o.value;
      const l = typeof o === "string" ? o : o.label;
      const on = v === value;
      return (
        <button key={v} onClick={() => onChange(v)} className={"segBtn" + (on ? " on" : "")}
          style={on && colorize ? { background: colorize, color: C.ink, borderColor: colorize } : undefined}>
          {l}
        </button>
      );
    })}
  </div>
);

/* ------------------------------------------------------------------ */
/* Main app                                                            */
/* ------------------------------------------------------------------ */
const STORE_KEY = "hydro-log-v1";

/* Storage lives on the device and nowhere else.
   - In a normal browser: localStorage, scoped to this site on this phone.
   - Inside Claude's preview: Claude's own artifact storage.
   - If both are blocked (private mode, some in-app browsers): memory for the session. */
const memory = {};
const backend = (() => {
  if (typeof window !== "undefined" && window.storage && window.storage.get) return "claude";
  try {
    window.localStorage.setItem("__probe", "1");
    window.localStorage.removeItem("__probe");
    return "local";
  } catch { return "memory"; }
})();
const store = {
  backend,
  async get(k) {
    if (backend === "claude") { const r = await window.storage.get(k); return r ? r.value : null; }
    if (backend === "local") return window.localStorage.getItem(k);
    return memory[k] ?? null;
  },
  async set(k, v) {
    if (backend === "claude") return window.storage.set(k, v);
    if (backend === "local") return window.localStorage.setItem(k, v);
    memory[k] = v;
  },
};

export default function App() {
  const [state, setState] = useState(null);
  const [status, setStatus] = useState("loading");
  const [tab, setTab] = useState("log");
  const [dateKey, setDateKey] = useState(toKey(new Date()));
  const [cat, setCat] = useState("water");
  const [sub, setSub] = useState("plain water");
  const [logTime, setLogTime] = useState(nowHM());
  const [customOpen, setCustomOpen] = useState(false);
  const [customOz, setCustomOz] = useState("");
  const [toast, setToast] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const saveTimer = useRef(null);

  /* load */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await store.get(STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        if (alive && parsed && parsed.days) { setState(parsed); setStatus("ready"); return; }
        throw new Error("empty");
      } catch {
        const fresh = { version: 1, goal: 96, days: buildSeed(), customSubs: {}, alcNet: { ...DEFAULT_ALC_NET } };
        if (alive) { setState(fresh); setStatus("ready"); }
        try { await store.set(STORE_KEY, JSON.stringify(fresh)); } catch { /* nothing to do */ }
      }
    })();
    return () => { alive = false; };
  }, []);

  /* save (debounced, single key) */
  useEffect(() => {
    if (!state || status !== "ready") return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try { await store.set(STORE_KEY, JSON.stringify(state)); }
      catch { setToast({ text: "Couldn't save to this device's storage", tone: "bad" }); }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [state, status]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  const days = state?.days || {};
  const goal = state?.goal || 96;
  const day = days[dateKey] || blankDay();
  const alcNetMap = state?.alcNet;
  const stats = useMemo(() => dayStats(dateKey, day, alcNetMap), [dateKey, day, alcNetMap]);

  const sortedKeys = useMemo(() => Object.keys(days).sort(), [days]);
  const series = useMemo(() => sortedKeys.map((k) => dayStats(k, days[k], alcNetMap)), [sortedKeys, days, alcNetMap]);

  const patchDay = (key, patch) =>
    setState((s) => ({ ...s, days: { ...s.days, [key]: { ...(s.days[key] || blankDay()), ...patch } } }));

  const addEntry = (oz, subOverride) => {
    const useSub = subOverride || sub;
    const entry = { id: uid(), oz: Number(oz), cat, sub: useSub, t: logTime };
    const cur = days[dateKey] || blankDay();
    patchDay(dateKey, { entries: [...cur.entries, entry].sort((a, b) => a.t.localeCompare(b.t)), seeded: false });
    const n = cat === "alcohol" ? ` · counts ${signed(netOz(oz, useSub, alcNetMap))} oz` : "";
    setToast({ text: `${oz} oz ${useSub} at ${hm12(logTime)}${n}`, entryId: entry.id, color: catOf(cat).color });
  };

  const removeEntry = (id) => {
    const cur = days[dateKey] || blankDay();
    patchDay(dateKey, { entries: cur.entries.filter((e) => e.id !== id) });
  };

  const editEntryTime = (id, t) => {
    const cur = days[dateKey] || blankDay();
    patchDay(dateKey, { entries: cur.entries.map((e) => (e.id === id ? { ...e, t } : e)).sort((a, b) => a.t.localeCompare(b.t)) });
  };

  const allSubs = (c) => [...catOf(c).subs, ...((state?.customSubs || {})[c] || [])];

  const addCustomSub = (c) => {
    const name = (prompt(`New ${catOf(c).label.toLowerCase()} type`) || "").trim();
    if (!name) return;
    setState((s) => ({ ...s, customSubs: { ...(s.customSubs || {}), [c]: [...((s.customSubs || {})[c] || []), name] } }));
    setSub(name);
  };

  if (status === "loading" || !state) {
    return <div className="shell"><Style /><div className="loading">Opening your log…</div></div>;
  }

  return (
    <div className="shell">
      <Style />
      <header className="topbar">
        <div className="brandRow">
          <span className="brandMark" />
          <span className="brand">Intake</span>
          <button className="ghostBtn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
        </div>
      </header>

      <main className="scroll">
        {tab === "log" && (
          <LogView
            dateKey={dateKey} setDateKey={setDateKey} day={day} stats={stats} goal={goal}
            cat={cat} setCat={setCat} sub={sub} setSub={setSub} allSubs={allSubs} addCustomSub={addCustomSub}
            logTime={logTime} setLogTime={setLogTime} addEntry={addEntry} removeEntry={removeEntry} alcNetMap={alcNetMap}
            editEntryTime={editEntryTime} patchDay={patchDay}
            customOpen={customOpen} setCustomOpen={setCustomOpen} customOz={customOz} setCustomOz={setCustomOz}
          />
        )}
        {tab === "trends" && <TrendsView series={series} goal={goal} onPick={(k) => { setDateKey(k); setTab("log"); }} />}
        {tab === "insights" && <InsightsView series={series} netMap={alcNetMap} />}
      </main>

      {toast && (
        <div className="toast" role="status">
          <span className="toastDot" style={{ background: toast.color || C.brass }} />
          <span className="toastText">{toast.text}</span>
          {toast.entryId && <button className="toastUndo" onClick={() => { removeEntry(toast.entryId); setToast(null); }}>Undo</button>}
        </div>
      )}

      {showSettings && (
        <SettingsSheet
          state={state} setState={setState} series={series}
          onClose={() => setShowSettings(false)}
          onImport={(incoming, mode) => {
            setState((s) => {
              const next = { ...s.days };
              Object.keys(incoming).forEach((k) => {
                if (mode === "skip" && next[k]) return;
                next[k] = incoming[k];
              });
              return { ...s, days: next };
            });
            const n = Object.keys(incoming).length;
            setShowSettings(false);
            setToast({ text: `${n} ${n === 1 ? "day" : "days"} imported` });
          }}
          onWipe={() => { setState((s) => ({ ...s, days: {} })); setShowSettings(false); setToast({ text: "All days cleared" }); }}
        />
      )}

      <nav className="tabs">
        {[["log", "Log"], ["trends", "Trends"], ["insights", "Insights"]].map(([id, label]) => (
          <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* LOG                                                                 */
/* ------------------------------------------------------------------ */
function LogView(props) {
  const {
    dateKey, setDateKey, day, stats, goal, cat, setCat, sub, setSub, allSubs, addCustomSub,
    logTime, setLogTime, addEntry, removeEntry, editEntryTime, patchDay, alcNetMap,
    customOpen, setCustomOpen, customOz, setCustomOz,
  } = props;
  const isToday = dateKey === toKey(new Date());
  const [openEntry, setOpenEntry] = useState(null);

  useEffect(() => { setSub(catOf(cat).subs[0]); }, [cat]); // eslint-disable-line

  // A shot glass means spirits and a wine glass means wine, unless you've already said otherwise.
  const subFor = (k) => {
    if (cat !== "alcohol") return sub;
    if (k.id === "shot2" && !["spirits", "whiskey"].includes(sub)) return "spirits";
    if (k.id === "wine5" && sub !== "wine") return "wine";
    return sub;
  };

  return (
    <>
      <div className="dateRow">
        <button className="ghostBtn" onClick={() => setDateKey(shiftKey(dateKey, -1))} aria-label="Previous day">‹</button>
        <div className="dateMid">
          <div className="dateBig">{isToday ? "Today" : weekday(dateKey)}</div>
          <div className="dateSmall mono">{longDate(dateKey)}</div>
        </div>
        <button className="ghostBtn" disabled={isToday} onClick={() => setDateKey(shiftKey(dateKey, 1))} aria-label="Next day">›</button>
      </div>

      <section className="vesselCard">
        <DayVessel stats={stats} goal={goal} />
        <div className="vesselSide">
          <div className="bigNum mono">{Math.round(stats.netTotal)}<span className="unit">oz</span></div>
          <div className="bigSub">counts toward goal {goal}</div>
          {stats.alcohol > 0 && (
            <div className="alcLine mono">{stats.alcohol} oz alcohol counts {signed(stats.alcNet)}</div>
          )}
          <ul className="miniLegend">
            {["water", "electrolyte", "caffeine", "other"].map((c) => (
              stats[c] > 0 ? (
                <li key={c}><i style={{ background: catOf(c).color }} /><span>{catOf(c).label}</span><b className="mono">{stats[c]}</b></li>
              ) : null
            ))}
            {stats.alcohol > 0 && (
              <li><i style={{ background: C.alcohol }} /><span>Alcohol (net)</span><b className="mono">{signed(stats.alcNet)}</b></li>
            )}
          </ul>
          {stats.netTotal > 0 && (
            <div className="elecChip mono" style={{ borderColor: stats.elecPct < 22 ? C.flag : C.line, color: stats.elecPct < 22 ? C.flag : C.dim }}>
              electrolytes {Math.round(stats.elecPct)}% of net fluid
            </div>
          )}
        </div>
      </section>

      <Card title="Pour something" note="Pick what it is, then tap the container.">
        <div className="chipRow">
          {CATS.map((c) => (
            <button key={c.id} className={"chip" + (cat === c.id ? " on" : "")} onClick={() => setCat(c.id)}
              style={cat === c.id ? { background: c.color, borderColor: c.color, color: C.ink } : { borderColor: c.color, color: c.color }}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="chipRow subRow">
          {allSubs(cat).map((s) => (
            <button key={s} className={"subChip" + (sub === s ? " on" : "")} onClick={() => setSub(s)}>{s}</button>
          ))}
          <button className="subChip add" onClick={() => addCustomSub(cat)}>+ type</button>
        </div>

        <div className="timeRow">
          <label className="timeLabel">Logging at</label>
          <input type="time" className="timeInput mono" value={logTime} onChange={(e) => setLogTime(e.target.value)} />
          <button className="nowBtn" onClick={() => setLogTime(nowHM())}>Now</button>
        </div>

        <div className="grid">
          {containersFor(cat).map((k) => (
            <button key={k.id} className="vessel" onClick={() => addEntry(k.oz, subFor(k))}>
              <ContainerIcon kind={k.kind} color={catOf(cat).color} />
              <span className="vOz mono">{k.oz} oz</span>
              {cat === "alcohol"
                ? <span className="vNet mono">{subFor(k)} {signed(netOz(k.oz, subFor(k), alcNetMap))}</span>
                : <span className="vLabel">{k.label}</span>}
            </button>
          ))}
          <button className="vessel dashed" onClick={() => setCustomOpen((v) => !v)}>
            <span className="plus">+</span>
            <span className="vOz mono">Custom</span>
            <span className="vLabel">any size</span>
          </button>
        </div>

        {customOpen && (
          <div className="customRow">
            <input className="ozInput mono" inputMode="decimal" placeholder="oz" value={customOz}
              onChange={(e) => setCustomOz(e.target.value)} />
            <button className="primaryBtn" disabled={!Number(customOz)}
              onClick={() => { addEntry(Number(customOz)); setCustomOz(""); setCustomOpen(false); }}>
              Add pour
            </button>
          </div>
        )}
      </Card>

      <Card title="Today's pours" note={day.entries.length ? `${day.entries.length} logged` : undefined}>
        {day.entries.length === 0 ? (
          <p className="empty">Nothing logged yet. Pick what you're drinking, then tap the container that matches.</p>
        ) : (
          <ul className="entries">
            {day.entries.map((e) => (
              <li key={e.id}>
                <button className="entryMain" onClick={() => setOpenEntry(openEntry === e.id ? null : e.id)}>
                  <span className="entryTime mono">{hm12(e.t)}</span>
                  <span className="entryDot" style={{ background: catOf(e.cat).color }} />
                  <span className="entrySub">{e.sub}</span>
                  {e.cat === "alcohol" && <span className="entryNet mono">{signed(netOz(e.oz, e.sub, alcNetMap))}</span>}
                  <span className="entryOz mono">{e.oz} oz</span>
                </button>
                {openEntry === e.id && (
                  <div className="entryEdit">
                    <input type="time" className="timeInput mono" value={e.t} onChange={(ev) => editEntryTime(e.id, ev.target.value)} />
                    <button className="dangerBtn" onClick={() => { removeEntry(e.id); setOpenEntry(null); }}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {stats.lastCaffeine != null && (
          <p className="footNote">Last caffeine {decToLabel(stats.lastCaffeine)}{stats.firstAlcohol != null ? ` · first alcohol ${decToLabel(stats.firstAlcohol)}` : ""}</p>
        )}
      </Card>

      <Card title="How the day went">
        <div className="fieldGrid">
          <div className="field">
            <label>Creatine (g)</label>
            <div className="stepper">
              <button onClick={() => patchDay(dateKey, { creatine: Math.max(0, Number(day.creatine || 0) - 1) })}>−</button>
              <span className="mono">{day.creatine || 0}</span>
              <button onClick={() => patchDay(dateKey, { creatine: Number(day.creatine || 0) + 1 })}>+</button>
            </div>
          </div>
          <div className="field">
            <label>Cramping</label>
            <Segmented options={CRAMP_LEVELS} value={day.cramping || "None"}
              onChange={(v) => patchDay(dateKey, { cramping: v })}
              colorize={day.cramping !== "None" ? C.flag : C.brass} />
          </div>
          {day.cramping !== "None" && (
            <div className="field wide">
              <label>Where / when did it cramp?</label>
              <input className="textInput" placeholder="e.g. calf, overnight" value={day.crampNote || ""}
                onChange={(e) => patchDay(dateKey, { crampNote: e.target.value })} />
            </div>
          )}
          <div className="field wide">
            <label>Other symptoms</label>
            <input className="textInput" placeholder="Normal" value={day.symptoms || ""}
              onChange={(e) => patchDay(dateKey, { symptoms: e.target.value })} />
          </div>
          <div className="field wide">
            <label>Workout / activity</label>
            <input className="textInput" placeholder="e.g. pull day, climbing, rest" value={day.workout || ""}
              onChange={(e) => patchDay(dateKey, { workout: e.target.value })} />
          </div>
          <div className="field wide">
            <label>Exertion</label>
            <Segmented options={EXERTION.map((v) => ({ value: v, label: EXERTION_LABEL[v] }))}
              value={day.exertion || "Rest"} onChange={(v) => patchDay(dateKey, { exertion: v })} colorize={C.brass} />
          </div>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* TRENDS                                                              */
/* ------------------------------------------------------------------ */
function TrendsView({ series, goal, onPick }) {
  const [range, setRange] = useState(14);
  const data = useMemo(() => {
    const s = range === 0 ? series : series.slice(-range);
    return s.map((d) => ({
      ...d,
      label: shortDate(d.key),
      elecPct: Math.round(d.elecPct * 10) / 10,
      crampMark: d.crampLevel > 0 ? Math.max(d.netTotal, d.tracked) + 6 : null,
    }));
  }, [series, range]);

  const roll = useMemo(() => data.map((d, i) => {
    const w = data.slice(Math.max(0, i - 2), i + 1);
    return { ...d, avg3: Math.round(avg(w.map((x) => x.netTotal))) };
  }), [data]);

  const cramps = data.filter((d) => d.crampLevel > 0);

  if (!series.length) return <Card title="No data yet"><p className="empty">Log a few days and the charts fill in here.</p></Card>;

  return (
    <>
      <div className="rangeRow">
        <Segmented options={[{ value: 7, label: "7d" }, { value: 14, label: "14d" }, { value: 30, label: "30d" }, { value: 0, label: "All" }]}
          value={range} onChange={setRange} colorize={C.brass} />
      </div>

      <Card title="Daily intake by type" note="Stacked ounces. Alcohol is shown at its net value, so spirits dip below the line. A flag marks a cramping day.">
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={data} margin={{ top: 14, right: 6, left: -22, bottom: 0 }}
            onClick={(e) => { const hit = e && e.activeLabel && data.find((d) => d.label === e.activeLabel); if (hit) onPick(hit.key); }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip />} />
            <ReferenceLine y={goal} stroke={C.brass} strokeDasharray="4 3" />
            <Bar dataKey="water" stackId="a" fill={C.water} />
            <Bar dataKey="electrolyte" stackId="a" fill={C.electrolyte} />
            <Bar dataKey="caffeine" stackId="a" fill={C.caffeine} />
            <Bar dataKey="other" stackId="a" fill={C.other} radius={[0, 0, 0, 0]} />
            <Bar dataKey="alcNet" stackId="a" fill={C.alcohol} radius={[3, 3, 0, 0]} />
            <ReferenceLine y={0} stroke={C.line} />
            <Scatter dataKey="crampMark" fill={C.flag} shape={CrampFlag} />
          </ComposedChart>
        </ResponsiveContainer>
        <ul className="legend">
          {["water", "electrolyte", "caffeine", "other"].map((c) => (
            <li key={c}><i style={{ background: catOf(c).color }} />{catOf(c).label}</li>
          ))}
          <li><i style={{ background: C.alcohol }} />Alcohol (net)</li>
          <li><i style={{ background: C.flag }} />Cramping</li>
        </ul>
      </Card>

      <Card title="Electrolyte share of intake" note="Electrolyte ounces as a percent of net fluid. Dilution shows up here before it shows up anywhere else.">
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={data} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} unit="%" width={44} />
            <Tooltip content={<Tip suffix="%" only="elecPct" />} />
            <Line type="monotone" dataKey="elecPct" stroke={C.electrolyte} strokeWidth={2.4} dot={<CrampDot data={data} />} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Three-day rolling average" note="Smooths out one big day so you can see the real baseline moving.">
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={roll} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip content={<Tip only="netTotal" alt="avg3" />} />
            <Bar dataKey="netTotal" fill={C.surface2} radius={[3, 3, 0, 0]} />
            <Line type="monotone" dataKey="avg3" stroke={C.brass} strokeWidth={2.4} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="When it lands" note="Every pour placed on the clock. Cramping days are on flagged rows.">
        <DayTimeline days={data} />
      </Card>

      <Card title="Caffeine load and cut-off" note="Ounces of caffeinated drink, and the time of the last one.">
        <ResponsiveContainer width="100%" height={190}>
          <ComposedChart data={data} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: C.dim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="l" tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" orientation="right" domain={[5, 22]} ticks={[6, 10, 14, 18, 22]}
              tickFormatter={(v) => decToLabel(v).replace(":00", "")} tick={{ fill: C.dim, fontSize: 9 }} axisLine={false} tickLine={false} width={46} />
            <Tooltip content={<Tip only="caffeine" timeKey="lastCaffeine" />} />
            <Bar yAxisId="l" dataKey="caffeine" fill={C.caffeine} radius={[3, 3, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="lastCaffeine" stroke={C.brass} strokeWidth={2} dot={{ r: 3, fill: C.brass }} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Intake vs. cramping" note="Each dot is a day. Filled dots cramped.">
        <ResponsiveContainer width="100%" height={210}>
          <ScatterChart margin={{ top: 10, right: 12, left: -18, bottom: 6 }}>
            <CartesianGrid stroke={C.line} strokeDasharray="2 4" />
            <XAxis type="number" dataKey="netTotal" name="Net oz" tick={{ fill: C.dim, fontSize: 10 }} axisLine={{ stroke: C.line }} tickLine={false} />
            <YAxis type="number" dataKey="elecPct" name="Electrolyte %" unit="%" width={46} tick={{ fill: C.dim, fontSize: 10 }} axisLine={false} tickLine={false} />
            <ZAxis range={[70, 70]} />
            <Tooltip content={<ScatterTip />} cursor={{ stroke: C.line }} />
            <Scatter data={data}>
              {data.map((d) => (
                <Cell key={d.key} fill={d.crampLevel > 0 ? C.flag : "transparent"} stroke={d.crampLevel > 0 ? C.flag : C.water} strokeWidth={2} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
        {cramps.length > 0 && (
          <p className="footNote">Cramping days sit at {cramps.map((d) => `${Math.round(d.elecPct)}%`).join(", ")} electrolytes.</p>
        )}
      </Card>
    </>
  );
}

const CrampFlag = (props) => {
  const { cx, cy } = props;
  if (cx == null || cy == null) return null;
  return <g><line x1={cx} x2={cx} y1={cy} y2={cy - 10} stroke={C.flag} strokeWidth="1.6" /><path d={`M${cx} ${cy - 10} l7 3 -7 3 z`} fill={C.flag} /></g>;
};

const CrampDot = ({ cx, cy, payload }) => {
  if (cx == null) return null;
  const cramped = payload?.crampLevel > 0;
  return <circle cx={cx} cy={cy} r={cramped ? 5 : 3} fill={cramped ? C.flag : C.electrolyte} stroke={C.ink} strokeWidth={cramped ? 2 : 0} />;
};

const METRIC_LABEL = { elecPct: "Electrolyte share", tracked: "Non-alcohol fluid", netTotal: "Net fluid", water: "Plain water", electrolyte: "Electrolytes", caffeine: "Caffeine drinks", alcohol: "Alcohol", alcNet: "Alcohol (net)", other: "Other" };

function Tip({ active, payload, label, suffix = " oz", only, alt, timeKey }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <div className="tipHead mono">{weekday(d.key)} {label}</div>
      {only ? (
        <>
          <div className="tipRow"><span>{METRIC_LABEL[only] || only}</span><b className="mono">{d[only]}{suffix}</b></div>
          {alt && <div className="tipRow"><span>3-day avg</span><b className="mono">{d[alt]} oz</b></div>}
          {timeKey && <div className="tipRow"><span>Last one</span><b className="mono">{decToLabel(d[timeKey])}</b></div>}
        </>
      ) : (
        <>
          {["water", "electrolyte", "caffeine", "other"].map((c) => d[c] > 0 && (
            <div className="tipRow" key={c}><span><i style={{ background: catOf(c).color }} />{catOf(c).label}</span><b className="mono">{d[c]} oz</b></div>
          ))}
          {d.alcohol > 0 && (
            <div className="tipRow"><span><i style={{ background: C.alcohol }} />{d.alcohol} oz alcohol</span><b className="mono">{signed(d.alcNet)} oz</b></div>
          )}
        </>
      )}
      {!only && <div className="tipRow total"><span>Net fluid</span><b className="mono">{d.netTotal} oz</b></div>}
      {d.crampLevel > 0 && <div className="tipFlag">{d.cramping} cramping</div>}
      {d.workout && <div className="tipSub">{d.workout} · {EXERTION_LABEL[d.exertion]}</div>}
    </div>
  );
}

function ScatterTip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tip">
      <div className="tipHead mono">{weekday(d.key)} {shortDate(d.key)}</div>
      <div className="tipRow"><span>Net fluid</span><b className="mono">{d.netTotal} oz</b></div>
      <div className="tipRow"><span>Electrolytes</span><b className="mono">{Math.round(d.elecPct)}%</b></div>
      {d.crampLevel > 0 && <div className="tipFlag">{d.cramping} cramping</div>}
    </div>
  );
}

function DayTimeline({ days }) {
  const HOURS = [6, 9, 12, 15, 18, 21];
  return (
    <div className="timeline">
      <div className="tlHead">
        <span />
        <div className="tlHours">{HOURS.map((h) => <span key={h} className="mono" style={{ left: `${((h - 5) / 18) * 100}%` }}>{h % 12 === 0 ? 12 : h % 12}{h < 12 ? "a" : "p"}</span>)}</div>
      </div>
      {days.map((d) => (
        <div className={"tlRow" + (d.crampLevel > 0 ? " cramp" : "")} key={d.key}>
          <span className="tlDate mono">{shortDate(d.key)}</span>
          <div className="tlTrack">
            {HOURS.map((h) => <span key={h} className="tlGrid" style={{ left: `${((h - 5) / 18) * 100}%` }} />)}
            {(d.entries || []).map((e) => {
              const x = ((toDec(e.t) - 5) / 18) * 100;
              const size = 6 + (e.oz / 28) * 12;
              return (
                <span key={e.id} className="tlDot" title={`${e.oz} oz ${e.sub} · ${hm12(e.t)}`}
                  style={{ left: `${Math.max(0, Math.min(100, x))}%`, width: size, height: size, background: catOf(e.cat).color }} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* INSIGHTS                                                            */
/* ------------------------------------------------------------------ */
function InsightsView({ series, netMap }) {
  if (!series.length) {
    return (
      <Card title="Nothing to compare yet">
        <p className="empty">
          Log a few days and this fills in: cramping days against clear ones, what shifted the day before,
          and the leads worth watching. If you have a backup file, Settings will bring it in.
        </p>
      </Card>
    );
  }
  const withPrev = useMemo(() => series.map((d, i) => ({ ...d, prev: i > 0 ? series[i - 1] : null })), [series]);
  const cramp = withPrev.filter((d) => d.crampLevel > 0);
  const clear = withPrev.filter((d) => d.crampLevel === 0);

  const metrics = [
    { key: "netTotal", label: "Net fluid", unit: " oz" },
    { key: "tracked", label: "Non-alcohol fluid", unit: " oz" },
    { key: "water", label: "Plain water", unit: " oz" },
    { key: "electrolyte", label: "Electrolytes", unit: " oz" },
    { key: "elecPct", label: "Electrolyte share", unit: "%" },
    { key: "caffeine", label: "Caffeine drinks", unit: " oz" },
    { key: "alcohol", label: "Alcohol poured", unit: " oz" },
    { key: "alcNet", label: "Alcohol (net)", unit: " oz" },
    { key: "creatine", label: "Creatine", unit: " g" },
  ];

  const compare = metrics.map((m) => ({
    ...m,
    cramp: r1(avg(cramp.map((d) => d[m.key]))),
    clear: r1(avg(clear.map((d) => d[m.key]))),
    crampPrev: r1(avg(cramp.filter((d) => d.prev).map((d) => d.prev[m.key]))),
    clearPrev: r1(avg(clear.filter((d) => d.prev).map((d) => d.prev[m.key]))),
  }));

  const jumps = withPrev.filter((d) => d.prev).map((d) => ({ ...d, delta: d.netTotal - d.prev.netTotal }));
  const biggestJump = jumps.slice().sort((a, b) => b.delta - a.delta)[0];

  const totals = series.map((d) => d.netTotal);
  const summary = {
    days: series.length,
    avg: r1(avg(totals)),
    min: totals.length ? Math.min(...totals) : 0,
    max: totals.length ? Math.max(...totals) : 0,
    avgElecPct: r1(avg(series.map((d) => d.elecPct))),
    crampDays: cramp.length,
  };

  return (
    <>
      <Card title="The log so far">
        <div className="statRow">
          <Stat v={summary.days} l="days logged" />
          <Stat v={summary.avg} l="avg net oz/day" />
          <Stat v={`${summary.min}–${summary.max}`} l="range" small />
          <Stat v={`${Math.round(summary.avgElecPct)}%`} l="avg electrolytes" />
        </div>
      </Card>

      <Card title="Cramping days vs. clear days"
        note={cramp.length < 3
          ? `Only ${cramp.length} cramping ${cramp.length === 1 ? "day" : "days"} on record. Treat these gaps as leads to watch, not answers — three or four weeks of logging is where patterns get trustworthy.`
          : "Averages across every day on record."}>
        {cramp.length === 0 ? (
          <p className="empty">No cramping logged yet. This table fills in the first time you mark one.</p>
        ) : (
          <table className="cmp">
            <thead>
              <tr><th></th><th>Cramp days</th><th>Clear days</th><th>Gap</th></tr>
            </thead>
            <tbody>
              {compare.map((m) => {
                const gap = m.cramp != null && m.clear != null ? r1(m.cramp - m.clear) : null;
                const big = gap != null && m.clear ? Math.abs(gap / (m.clear || 1)) > 0.25 : false;
                return (
                  <tr key={m.key} className={big ? "hot" : ""}>
                    <td>{m.label}</td>
                    <td className="mono">{m.cramp ?? "—"}{m.unit}</td>
                    <td className="mono">{m.clear ?? "—"}{m.unit}</td>
                    <td className="mono gap">{gap == null ? "—" : `${gap > 0 ? "+" : ""}${gap}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      {cramp.length > 0 && (
        <Card title="The day before" note="Cramps often trail the cause by a day, so the same comparison shifted back 24 hours.">
          <table className="cmp">
            <thead><tr><th></th><th>Before a cramp</th><th>Before a clear day</th></tr></thead>
            <tbody>
              {compare.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td className="mono">{m.crampPrev ?? "—"}{m.unit}</td>
                  <td className="mono">{m.clearPrev ?? "—"}{m.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card title="What stands out" note="Generated from your log, refreshed every time you add a day.">
        <ul className="leads">
          {cramp.map((d) => {
            const rank = series.slice().sort((a, b) => a.elecPct - b.elecPct).findIndex((x) => x.key === d.key) + 1;
            return (
              <li key={d.key}>
                <b>{weekday(d.key)} {shortDate(d.key)} — {d.cramping.toLowerCase()} cramping.</b>{" "}
                {Math.round(d.netTotal)} oz of net fluid, electrolytes at {Math.round(d.elecPct)}%
                {rank === 1 ? " — the lowest share in the whole log" : ` — ${rank}${rank === 2 ? "nd" : rank === 3 ? "rd" : "th"} lowest share on record`}.
                {d.prev ? ` Intake moved ${d.netTotal - d.prev.netTotal > 0 ? "up" : "down"} ${Math.abs(Math.round(d.netTotal - d.prev.netTotal))} oz from the day before.` : ""}
                {d.exertion === "Rest" ? " It was a rest day." : ` Activity: ${d.workout || "logged"} at ${EXERTION_LABEL[d.exertion].toLowerCase()} exertion.`}
              </li>
            );
          })}
          {biggestJump && (
            <li>Biggest single-day swing: <b>{weekday(biggestJump.key)} {shortDate(biggestJump.key)}</b>, up {Math.round(biggestJump.delta)} oz on the previous day.
              {biggestJump.crampLevel > 0 ? " That day also cramped." : " No cramping that day."}</li>
          )}
          <li>Electrolytes have held steady while water has moved around, so your electrolyte share swings with how much water you drink. Watching that percentage is more informative than watching total ounces.</li>
          <li>Three things worth adding as you go: bodyweight in the morning, sleep, and whether cramps hit overnight or during effort. Overnight calf cramps and mid-workout cramps usually have different causes.</li>
        </ul>
      </Card>

      <Card title="How alcohol is counted" note="Net values, not poured ounces. Adjust any of them in Settings.">
        <ul className="netList">
          {Object.keys({ ...DEFAULT_ALC_NET, ...(netMap || {}) }).map((k) => {
            const f = netFactor(k, netMap);
            const ex = k === "wine" ? 5 : k === "spirits" || k === "whiskey" ? 1.5 : 12;
            return (
              <li key={k}>
                <span>{k}</span>
                <b className="mono" style={{ color: f > 0 ? C.electrolyte : f < 0 ? C.flag : C.dim }}>
                  {ex} oz → {signed(netOz(ex, k, netMap))} oz
                </b>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Reading this honestly">
        <p className="prose">
          A week of days can only suggest. With one cramping day, any metric that differed that day will look like a cause — the low electrolyte share, the big water jump, the extra caffeine, and the rest day are all tangled together and can't be separated yet.
          Keep logging for three or four weeks. If cramping keeps landing on the low-electrolyte-share days, that's a pattern worth acting on. And if cramping is frequent or painful, this log is a good thing to hand to a doctor rather than a substitute for one.
        </p>
      </Card>
    </>
  );
}

const Stat = ({ v, l, small }) => (
  <div className="stat"><div className={"statV mono" + (small ? " sm" : "")}>{v}</div><div className="statL">{l}</div></div>
);

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */
function SettingsSheet({ state, setState, series, onClose, onWipe, onImport }) {
  const [importing, setImporting] = useState(false);
  const netMap = { ...DEFAULT_ALC_NET, ...(state.alcNet || {}) };
  const bumpNet = (k, d) => setState((s) => {
    const cur = { ...DEFAULT_ALC_NET, ...(s.alcNet || {}) };
    const next = Math.max(-1, Math.min(1, Math.round((cur[k] + d) * 100) / 100));
    return { ...s, alcNet: { ...cur, [k]: next } };
  });
  const [confirm, setConfirm] = useState(null);
  const [badFile, setBadFile] = useState(false);
  const fileRef = useRef(null);

  const csv = () => {
    const head = ["Date", "Net fluid (oz)", "Total liquids (no alcohol)", "Creatine (g)", "Water (oz)", "Electrolytes (oz)", "Electrolyte share (%)", "Caffeine (oz)", "Caffeine type", "Caffeine time finished", "Alcohol poured (oz)", "Alcohol net (oz)", "Alcohol type", "Alcohol time", "Other (oz)", "Other types", "Symptoms", "Cramping", "Workout", "Exertion"];
    const rows = Object.keys(state.days).sort().map((k) => {
      const d = state.days[k];
      const s = dayStats(k, d, state.alcNet);
      const typesOf = (c) => [...new Set(d.entries.filter((e) => e.cat === c).map((e) => e.sub))].join("; ");
      return [k, s.netTotal, s.tracked, d.creatine || 0, s.water, s.electrolyte, Math.round(s.elecPct * 10) / 10, s.caffeine, typesOf("caffeine"), s.lastCaffeine != null ? decToLabel(s.lastCaffeine) : "", s.alcohol, s.alcNet, typesOf("alcohol"), s.firstAlcohol != null ? decToLabel(s.firstAlcohol) : "NA", s.other, typesOf("other"), d.symptoms || "", d.cramping || "None", d.workout || "", d.exertion || "Rest"];
    });
    return [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  };

  const saveAs = (text, name, type) => {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const stamp = toKey(new Date());
  const download = () => saveAs(csv(), `intake-log-${stamp}.csv`, "text/csv");
  const backup = () => saveAs(JSON.stringify(state, null, 2), `intake-backup-${stamp}.json`, "application/json");

  const restore = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const data = JSON.parse(String(fr.result));
        if (!data || !data.days) throw new Error("shape");
        setState((s) => ({ ...s, ...data, days: { ...s.days, ...data.days } }));
        onClose();
      } catch {
        setBadFile(true);
      }
    };
    fr.readAsText(file);
  };

  return (
    <div className="sheetWrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheetGrip" />
        {importing ? (
          <ImportPanel
            existing={Object.keys(state.days)}
            onCancel={() => setImporting(false)}
            onApply={(days, mode) => { setImporting(false); onImport(days, mode); }}
          />
        ) : (
        <>
        <h2 className="cardTitle">Settings</h2>

        <div className="field wide">
          <label>Daily goal (oz of net fluid)</label>
          <div className="stepper wide">
            <button onClick={() => setState((s) => ({ ...s, goal: Math.max(16, s.goal - 8) }))}>−8</button>
            <span className="mono">{state.goal}</span>
            <button onClick={() => setState((s) => ({ ...s, goal: s.goal + 8 }))}>+8</button>
          </div>
        </div>

        <div className="field wide">
          <label>What alcohol counts as</label>
          <ul className="netEdit">
            {Object.keys(netMap).map((k) => {
              const ex = k === "wine" ? 5 : k === "spirits" || k === "whiskey" ? 1.5 : 12;
              return (
                <li key={k}>
                  <span className="netName">{k}</span>
                  <span className="netEx mono">{ex} oz → {signed(netOz(ex, k, netMap))} oz</span>
                  <span className="netCtl">
                    <button onClick={() => bumpNet(k, -0.05)}>−</button>
                    <b className="mono">{Math.round(netMap[k] * 100)}%</b>
                    <button onClick={() => bumpNet(k, 0.05)}>+</button>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="sheetNote">Percent of the poured volume that counts toward fluid. Anything you add yourself starts at 0% — a wash.</p>
        </div>

        <p className="sheetNote">
          {series.length} {series.length === 1 ? "day" : "days"} stored{store.backend === "local"
            ? " in this browser on this device. Nothing is uploaded, and no one else visiting the site sees it."
            : store.backend === "memory"
              ? ". This browser is blocking storage (private mode?), so today's entries disappear when you close the tab."
              : " in this preview."}{" "}
          Clearing the browser's site data erases the log, so save a backup now and then.
        </p>

        <button className="primaryBtn wide" onClick={download}>Download CSV</button>
        <button className="ghostWide" onClick={backup}>Save a backup file</button>
        <button className="ghostWide" onClick={() => { setBadFile(false); fileRef.current && fileRef.current.click(); }}>
          Restore from a backup file
        </button>
        <button className="ghostWide" onClick={() => setImporting(true)}>Import a spreadsheet (CSV)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: "none" }}
          onChange={(e) => { restore(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        {badFile && <p className="sheetNote" style={{ color: C.flag }}>That file isn't an intake backup. Pick the .json this app saved.</p>}
        <button className="ghostWide danger" onClick={() => setConfirm("wipe")}>Clear all days</button>

        {confirm && (
          <div className="confirm">
            <p>This deletes every logged day. There's no undo.</p>
            <div className="confirmRow">
              <button className="ghostWide" onClick={() => setConfirm(null)}>Keep what I have</button>
              <button className="dangerBtn" onClick={onWipe}>Clear it</button>
            </div>
          </div>
        )}

        <button className="primaryBtn wide ghostish" onClick={onClose}>Done</button>
        </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Import panel                                                        */
/* ------------------------------------------------------------------ */
function ImportPanel({ existing, onCancel, onApply }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [showNotes, setShowNotes] = useState(false);
  const fileRef = useRef(null);

  const run = (raw) => {
    const trimmed = String(raw || "").trim();
    if (!trimmed) { setResult({ days: {}, errors: [{ line: 0, message: "Nothing to read yet." }], notes: [] }); return; }
    setResult(parseIntakeCSV(trimmed));
  };

  const readFile = (file) => {
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => run(String(fr.result));
    fr.readAsText(file);
  };

  const keys = result ? Object.keys(result.days).sort() : [];
  const fresh = keys.filter((k) => !existing.includes(k));
  const clashes = keys.filter((k) => existing.includes(k));

  return (
    <>
      <h2 className="cardTitle">Import a spreadsheet</h2>
      <p className="sheetNote" style={{ marginTop: 6 }}>
        One row per day, with your column headings in the first row. Date, water, electrolytes,
        caffeine, alcohol, other liquids, creatine, cramping, workout and exertion all come across.
        Ounces get spread over plausible times, since a daily total doesn't say when you drank it.
      </p>

      {!result && (
        <>
          <button className="primaryBtn wide" onClick={() => fileRef.current && fileRef.current.click()}>Choose a CSV file</button>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" style={{ display: "none" }}
            onChange={(e) => { readFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
          <p className="sheetNote">Or copy the rows straight out of Excel or Sheets and paste them here:</p>
          <textarea className="pasteBox mono" value={text} onChange={(e) => setText(e.target.value)}
            placeholder={"Date\tTotal liquids\tCreatine...\n8-21-26\t80\t0..."} rows={5} />
          <button className="ghostWide" onClick={() => run(text)}>Read what I pasted</button>
        </>
      )}

      {result && (
        <>
          {keys.length > 0 && (
            <div className="impSummary">
              <b className="mono">{keys.length}</b> {keys.length === 1 ? "day" : "days"} read,
              {" "}{shortDate(keys[0])}–{shortDate(keys[keys.length - 1])}.
              {clashes.length > 0 && <> {clashes.length} {clashes.length === 1 ? "day is" : "days are"} already in your log.</>}
            </div>
          )}

          {keys.length > 0 && (
            <ul className="impRows">
              {keys.map((k) => {
                const d = result.days[k];
                const oz = d.entries.filter((e) => e.cat !== "alcohol").reduce((a, e) => a + e.oz, 0);
                return (
                  <li key={k}>
                    <span className="impDate mono">{weekday(k)} {shortDate(k)}</span>
                    <span className="impOz mono">{Math.round(oz)} oz</span>
                    {d.cramping !== "None" && <span className="impCramp">{d.cramping.toLowerCase()}</span>}
                    <span className={"impTag" + (existing.includes(k) ? " clash" : "")}>
                      {existing.includes(k) ? "already logged" : "new"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {result.errors.length > 0 && (
            <ul className="impErrs">
              {result.errors.map((e, i) => (
                <li key={i}>{e.line ? `Row ${e.line}: ` : ""}{e.message}</li>
              ))}
            </ul>
          )}

          {result.notes.length > 0 && (
            <>
              <button className="linkBtn" onClick={() => setShowNotes((v) => !v)}>
                {showNotes ? "Hide" : "Show"} {result.notes.length} note{result.notes.length === 1 ? "" : "s"}
              </button>
              {showNotes && <ul className="impNotes">{result.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </>
          )}

          {keys.length > 0 && (
            <>
              <button className="primaryBtn wide" disabled={!fresh.length}
                onClick={() => onApply(Object.fromEntries(fresh.map((k) => [k, result.days[k]])), "skip")}>
                {fresh.length ? `Add ${fresh.length} new ${fresh.length === 1 ? "day" : "days"}` : "No new days to add"}
              </button>
              {clashes.length > 0 && (
                <button className="ghostWide" onClick={() => onApply(result.days, "replace")}>
                  Import all {keys.length}, overwriting the {clashes.length} I already have
                </button>
              )}
            </>
          )}
          <button className="ghostWide" onClick={() => { setResult(null); setText(""); }}>Pick a different file</button>
        </>
      )}

      <button className="ghostWide" onClick={onCancel}>Back to settings</button>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');

.shell{--ink:${C.ink};--ink2:${C.ink2};--surface:${C.surface};--surface2:${C.surface2};--line:${C.line};--dim:${C.dim};--text:${C.text};--brass:${C.brass};--flag:${C.flag};
  background:var(--ink);color:var(--text);min-height:100vh;display:flex;flex-direction:column;
  font-family:'IBM Plex Sans',system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.5;
  max-width:520px;margin:0 auto;position:relative;overflow:hidden}
.shell *{box-sizing:border-box}
.shell button{font-family:inherit;cursor:pointer;color:inherit}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
.loading{padding:80px 24px;color:var(--dim);text-align:center}

.topbar{padding:14px 18px 6px;border-bottom:1px solid var(--line);background:var(--ink);position:sticky;top:0;z-index:5}
.brandRow{display:flex;align-items:center;gap:9px}
.brandMark{width:11px;height:18px;border:1.6px solid var(--brass);border-radius:2px 2px 4px 4px;background:linear-gradient(to top,${C.water} 55%,transparent 55%)}
.brand{font-family:'Barlow Condensed',sans-serif;font-size:22px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;flex:1}
.ghostBtn{background:none;border:1px solid var(--line);border-radius:9px;width:34px;height:34px;font-size:16px;color:var(--dim);display:grid;place-items:center}
.ghostBtn:disabled{opacity:.3}

.scroll{flex:1;overflow-y:auto;padding:14px 14px 96px;-webkit-overflow-scrolling:touch}

.dateRow{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.dateMid{flex:1;text-align:center}
.dateBig{font-family:'Barlow Condensed',sans-serif;font-size:26px;font-weight:600;letter-spacing:.04em;line-height:1}
.dateSmall{font-size:11px;color:var(--dim);letter-spacing:.03em;margin-top:3px}

.vesselCard{display:flex;gap:14px;align-items:center;background:var(--ink2);border:1px solid var(--line);border-radius:18px;padding:16px 16px 16px 8px;margin-bottom:14px}
.vesselSide{flex:1;min-width:0}
.bigNum{font-size:44px;font-weight:600;line-height:.95;letter-spacing:-.02em}
.unit{font-size:16px;color:var(--dim);margin-left:4px}
.bigSub{font-size:12px;color:var(--dim);margin-top:2px}
.alcLine{font-size:11px;color:${C.alcohol};margin-top:4px}
.miniLegend{list-style:none;padding:0;margin:12px 0 0;display:flex;flex-direction:column;gap:5px}
.miniLegend li{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dim)}
.miniLegend i{width:8px;height:8px;border-radius:2px;flex:none}
.miniLegend b{margin-left:auto;color:var(--text);font-weight:500}
.elecChip{margin-top:11px;font-size:10.5px;border:1px solid var(--line);border-radius:999px;padding:4px 9px;display:inline-block;letter-spacing:.02em}

.card{background:var(--ink2);border:1px solid var(--line);border-radius:18px;padding:16px;margin-bottom:14px}
.cardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:12px}
.cardTitle{font-family:'Barlow Condensed',sans-serif;font-size:19px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin:0}
.cardNote{font-size:12px;color:var(--dim);margin:5px 0 0;line-height:1.45}
.empty{color:var(--dim);font-size:13px;margin:2px 0}
.footNote{font-size:11.5px;color:var(--dim);margin:10px 0 0;letter-spacing:.02em}
.prose{font-size:13.5px;color:var(--dim);margin:0;line-height:1.6}

.chipRow{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:9px}
.chip{background:none;border:1px solid var(--line);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:500;letter-spacing:.02em}
.subRow{padding-bottom:2px}
.subChip{background:var(--surface);border:1px solid transparent;border-radius:8px;padding:5px 10px;font-size:12px;color:var(--dim)}
.subChip.on{background:var(--surface2);color:var(--text);border-color:var(--line)}
.subChip.add{background:none;border:1px dashed var(--line)}

.timeRow{display:flex;align-items:center;gap:8px;margin:12px 0}
.timeLabel{font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em}
.timeInput{background:var(--surface);border:1px solid var(--line);border-radius:9px;color:var(--text);padding:6px 9px;font-size:13px}
.nowBtn{background:none;border:1px solid var(--line);border-radius:9px;padding:6px 11px;font-size:12px;color:var(--brass)}

.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.vessel{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:9px 4px 8px;display:flex;flex-direction:column;align-items:center;gap:2px;transition:transform .12s,background .12s}
.vessel:active{transform:scale(.94);background:var(--surface2)}
.vessel.dashed{border-style:dashed;justify-content:center}
.plus{font-size:26px;color:var(--dim);line-height:1;margin:8px 0 6px}
.vOz{font-size:12.5px;font-weight:600;margin-top:3px}
.vLabel{font-size:9.5px;color:var(--dim);text-align:center;line-height:1.2}
.vNet{font-size:9.5px;color:${C.alcohol};text-align:center;line-height:1.2;margin-top:1px}
.entryNet{font-size:11px;color:${C.alcohol};flex:none}
.netList{list-style:none;padding:0;margin:0}
.netList li{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:12.5px;color:var(--dim);padding:7px 0;border-top:1px solid var(--line)}
.netList li:first-child{border-top:none}
.netEdit{list-style:none;padding:0;margin:0}
.netEdit li{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line)}
.netEdit li:first-child{border-top:none}
.netName{font-size:13px;flex:none;width:78px;text-transform:capitalize}
.netEx{font-size:11px;color:var(--dim);flex:1}
.netCtl{display:flex;align-items:center;gap:2px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:2px}
.netCtl button{background:none;border:none;width:28px;height:26px;font-size:16px;color:var(--brass)}
.netCtl b{font-size:12px;width:40px;text-align:center}
.pasteBox{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:10px;font-size:12px;line-height:1.5;margin:4px 0 0;resize:vertical}
.pasteBox::placeholder{color:#41626D}
.impSummary{background:var(--surface);border-radius:12px;padding:11px 13px;font-size:13px;color:var(--dim);margin:12px 0 10px}
.impSummary b{color:var(--text);font-size:15px}
.impRows{list-style:none;padding:0;margin:0 0 10px;max-height:210px;overflow-y:auto}
.impRows li{display:flex;align-items:center;gap:8px;padding:7px 0;border-top:1px solid var(--line);font-size:12.5px}
.impRows li:first-child{border-top:none}
.impDate{flex:1;color:var(--dim)}
.impOz{font-weight:600}
.impCramp{font-size:10px;color:${C.flag}}
.impTag{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:${C.electrolyte};border:1px solid ${C.electrolyte}55;border-radius:999px;padding:2px 7px}
.impTag.clash{color:var(--brass);border-color:${C.brass}55}
.impErrs{list-style:none;padding:10px 12px;margin:0 0 10px;border:1px solid ${C.flag}55;border-radius:12px;font-size:12px;color:${C.flag}}
.impErrs li{padding:2px 0}
.impNotes{list-style:none;padding:0;margin:6px 0 10px;font-size:11.5px;color:var(--dim)}
.impNotes li{padding:3px 0;padding-left:10px;border-left:2px solid var(--line)}
.linkBtn{background:none;border:none;color:var(--brass);font-size:12px;padding:6px 0;text-decoration:underline}

.customRow{display:flex;gap:8px;margin-top:10px}
.ozInput{flex:none;width:84px;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:9px 11px;font-size:15px}
.primaryBtn{flex:1;background:var(--brass);color:${C.ink};border:none;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;letter-spacing:.02em}
.primaryBtn:disabled{opacity:.4}
.primaryBtn.wide{width:100%;flex:none;margin-top:10px}
.primaryBtn.ghostish{background:var(--surface2);color:var(--text)}
.dangerBtn{background:none;border:1px solid ${C.alcohol};color:${C.alcohol};border-radius:9px;padding:7px 13px;font-size:12.5px}
.ghostWide{width:100%;background:none;border:1px solid var(--line);border-radius:10px;padding:10px;font-size:13px;color:var(--dim);margin-top:8px}
.ghostWide.danger{color:${C.alcohol};border-color:${C.alcohol}44}

.entries{list-style:none;padding:0;margin:0}
.entries li{border-bottom:1px solid var(--line)}
.entries li:last-child{border-bottom:none}
.entryMain{display:flex;align-items:center;gap:9px;width:100%;background:none;border:none;padding:9px 2px;text-align:left}
.entryTime{font-size:11.5px;color:var(--dim);width:66px;flex:none}
.entryDot{width:8px;height:8px;border-radius:50%;flex:none}
.entrySub{flex:1;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.entryOz{font-size:13px;font-weight:600}
.entryEdit{display:flex;gap:8px;align-items:center;padding:0 2px 10px}

.fieldGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.field{min-width:0}
.field.wide{grid-column:1/-1}
.field label{display:block;font-size:10.5px;color:var(--dim);text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
.textInput{width:100%;background:var(--surface);border:1px solid var(--line);border-radius:10px;color:var(--text);padding:9px 11px;font-size:14px}
.textInput::placeholder{color:#4E7481}
.stepper{display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:4px}
.stepper.wide{padding:6px}
.stepper button{background:none;border:none;font-size:19px;width:38px;height:32px;color:var(--brass)}
.stepper span{font-size:16px;font-weight:600}

.seg{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:3px;gap:3px}
.segBtn{flex:1;background:none;border:1px solid transparent;border-radius:7px;padding:6px 2px;font-size:11.5px;color:var(--dim);white-space:nowrap}
.segBtn.on{background:var(--brass);color:${C.ink};font-weight:600}

.rangeRow{margin-bottom:12px}
.legend{list-style:none;display:flex;flex-wrap:wrap;gap:10px;padding:0;margin:10px 0 0;font-size:11px;color:var(--dim)}
.legend li{display:flex;align-items:center;gap:5px}
.legend i{width:8px;height:8px;border-radius:2px}

.tip{background:${C.ink};border:1px solid var(--line);border-radius:11px;padding:9px 11px;font-size:12px;box-shadow:0 8px 24px #0006}
.tipHead{font-size:11px;color:var(--brass);letter-spacing:.06em;text-transform:uppercase;margin-bottom:6px}
.tipRow{display:flex;justify-content:space-between;gap:16px;padding:1px 0}
.tipRow span{display:flex;align-items:center;gap:6px;color:var(--dim)}
.tipRow i{width:7px;height:7px;border-radius:2px}
.tipRow.total{border-top:1px solid var(--line);margin-top:5px;padding-top:5px}
.tipFlag{margin-top:6px;color:${C.flag};font-size:11px;letter-spacing:.04em}
.tipSub{margin-top:3px;color:var(--dim);font-size:11px}

.timeline{margin-top:4px}
.tlHead{display:flex;gap:8px;height:14px;margin-bottom:4px}
.tlHead>span{width:34px;flex:none}
.tlHours{position:relative;flex:1}
.tlHours span{position:absolute;font-size:9px;color:var(--dim);transform:translateX(-50%)}
.tlRow{display:flex;align-items:center;gap:8px;height:24px}
.tlDate{width:34px;flex:none;font-size:10px;color:var(--dim)}
.tlRow.cramp .tlDate{color:${C.flag}}
.tlTrack{position:relative;flex:1;height:100%;border-bottom:1px solid var(--line)}
.tlRow.cramp .tlTrack{background:${C.flag}12}
.tlGrid{position:absolute;top:0;bottom:0;width:1px;background:var(--line);opacity:.5}
.tlDot{position:absolute;top:50%;border-radius:50%;transform:translate(-50%,-50%);opacity:.85}

.statRow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.stat{background:var(--surface);border-radius:12px;padding:10px 6px;text-align:center}
.statV{font-size:20px;font-weight:600}
.statV.sm{font-size:14px;padding:3px 0}
.statL{font-size:9.5px;color:var(--dim);margin-top:3px;line-height:1.25}

.cmp{width:100%;border-collapse:collapse;font-size:12.5px}
.cmp th{text-align:right;font-size:10px;color:var(--dim);text-transform:uppercase;letter-spacing:.07em;font-weight:500;padding:0 0 7px 6px}
.cmp th:first-child{text-align:left}
.cmp td{padding:7px 0 7px 6px;text-align:right;border-top:1px solid var(--line)}
.cmp td:first-child{text-align:left;color:var(--dim)}
.cmp tr.hot td{color:${C.flag}}
.cmp tr.hot td:first-child{color:${C.flag}}
.cmp .gap{color:var(--brass)}

.leads{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:11px}
.leads li{font-size:13px;color:var(--dim);line-height:1.55;padding-left:12px;border-left:2px solid var(--line)}
.leads li b{color:var(--text);font-weight:600}

.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:78px;background:var(--surface2);border:1px solid var(--line);border-radius:999px;padding:9px 14px;display:flex;align-items:center;gap:9px;font-size:12.5px;z-index:20;box-shadow:0 10px 28px #0007;max-width:92vw}
.toastDot{width:8px;height:8px;border-radius:50%;flex:none}
.toastText{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.toastUndo{background:none;border:none;color:var(--brass);font-weight:600;font-size:12.5px;padding:0 0 0 4px}

.sheetWrap{position:fixed;inset:0;background:#0008;z-index:30;display:flex;align-items:flex-end;justify-content:center}
.sheet{background:var(--ink2);border:1px solid var(--line);border-radius:20px 20px 0 0;padding:12px 18px 26px;width:100%;max-width:520px;max-height:86vh;overflow-y:auto}
.sheetGrip{width:38px;height:4px;background:var(--line);border-radius:999px;margin:0 auto 14px}
.sheetNote{font-size:12px;color:var(--dim);margin:14px 0 4px}
.confirm{margin-top:12px;border:1px solid ${C.alcohol}55;border-radius:12px;padding:12px;font-size:12.5px;color:var(--dim)}
.confirm p{margin:0 0 10px}
.confirmRow{display:flex;gap:8px;align-items:center}
.confirmRow .ghostWide{margin-top:0}

.tabs{position:fixed;bottom:0;left:0;right:0;max-width:520px;margin:0 auto;display:flex;background:${C.ink}f2;border-top:1px solid var(--line);padding:8px 10px calc(8px + env(safe-area-inset-bottom));backdrop-filter:blur(8px);z-index:15}
.tab{flex:1;background:none;border:none;padding:9px 0;font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);border-radius:10px}
.tab.on{color:${C.ink};background:var(--brass)}

@media (prefers-reduced-motion:reduce){.shell *{transition:none!important;animation:none!important}}
    `}</style>
  );
}
