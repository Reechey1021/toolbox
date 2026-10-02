// engine/format.js
// How numbers are written on screen. Pure module.

const MINUS = "−"; // a real minus sign: wider and easier to read than a hyphen

const pad = (n) => String(n).padStart(2, "0");

/** 425 -> "07:05", 3725 -> "1:02:05" (the old app wrote "62:05"). */
export function fmtTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "--:--";
  const s = Math.max(0, Math.trunc(seconds));
  const h = Math.trunc(s / 3600), m = Math.trunc((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
export const fmtMs = (ms) => fmtTime(ms == null ? null : ms / 1000);

/** Whole-second delta like the old app: "−0:04", "+1:12", "±0:00". */
export function fmtSigned(seconds) {
  if (seconds == null) return "–";
  const sign = seconds < 0 ? MINUS : seconds > 0 ? "+" : "±";
  const a = Math.abs(Math.trunc(seconds));
  return `${sign}${Math.trunc(a / 60)}:${pad(a % 60)}`;
}

/** Live delta with tenths under a minute: "−4.2", "+12.0", "−1:04". */
export function fmtDelta(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "–";
  const sign = seconds < -0.05 ? MINUS : seconds > 0.05 ? "+" : "±";
  const a = Math.abs(seconds);
  if (a < 60) return `${sign}${a.toFixed(1)}`;
  return `${sign}${Math.trunc(a / 60)}:${pad(Math.trunc(a % 60))}`;
}

export const fmt1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "0.0");
/** Live distance: two decimals under 100 km so it visibly moves every 10 m. */
export const fmtKmLive = (km) => (km < 100 ? km.toFixed(2) : km.toFixed(1));

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** "Ma 14:32", "Tegnap 09:05", "okt. 2. 14:32", "2025. márc. 3. 14:32". */
export function fmtDate(ms, now = Date.now()) {
  if (!ms) return "–";
  const d = new Date(ms), n = new Date(now);
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (sameDay(d, n)) return `Ma ${time}`;
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (sameDay(d, y)) return `Tegnap ${time}`;
  const months = ["jan.", "febr.", "márc.", "ápr.", "máj.", "jún.", "júl.", "aug.", "szept.", "okt.", "nov.", "dec."];
  const md = `${months[d.getMonth()]} ${d.getDate()}.`;
  return d.getFullYear() === n.getFullYear() ? `${md} ${time}` : `${d.getFullYear()}. ${md} ${time}`;
}

/** Spoken numbers for the voice: Hungarian uses a decimal comma. */
export const sayNum = (x, digits = 1) => x.toFixed(digits).replace(".", ",").replace(/,0$/, "");

/** "12 perc 5 másodperc" for the voice. */
export function sayTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.trunc(s / 3600), m = Math.trunc((s % 3600) / 60), sec = s % 60;
  const parts = [];
  if (h) parts.push(`${h} óra`);
  if (m) parts.push(`${m} perc`);
  if (sec || !parts.length) parts.push(`${sec} másodperc`);
  return parts.join(" ");
}

/** "3 másodperccel előrébb" / "2,5 másodperccel lemaradva". */
export function sayDelta(seconds) {
  if (seconds == null) return "";
  const a = Math.abs(seconds);
  if (a < 0.5) return "pont a rekord idején";
  const amount = a >= 60 ? sayTime(a).replace(/másodperc$/, "másodperccel").replace(/perc$/, "perccel").replace(/óra$/, "órával") : `${sayNum(a)} másodperccel`;
  return seconds < 0 ? `${amount} előrébb` : `${amount} lemaradva`;
}
