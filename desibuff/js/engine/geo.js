// engine/geo.js
// Distances on the Earth, done exactly the way the Android app did them.
// Android's Location.distanceBetween() uses Vincenty's formula on the WGS84
// ellipsoid and returns a 32-bit float; this is a line-for-line port, so a ride
// measured here gives the same metres as it did on the phone app.
//
// Pure module: no DOM, no storage. Safe to import in tests.

const RAD = Math.PI / 180;

/** Metres between two points (Android Location.distanceBetween). */
export function distanceBetween(lat1, lon1, lat2, lon2) {
  const MAXITERS = 20;
  lat1 *= RAD; lat2 *= RAD; lon1 *= RAD; lon2 *= RAD;
  const a = 6378137.0;
  const b = 6356752.3142;
  const f = (a - b) / a;
  const aSqMinusBSqOverBSq = (a * a - b * b) / (b * b);
  const l = lon2 - lon1;
  let aA = 0.0;
  const u1 = Math.atan((1.0 - f) * Math.tan(lat1));
  const u2 = Math.atan((1.0 - f) * Math.tan(lat2));
  const cosU1 = Math.cos(u1), cosU2 = Math.cos(u2);
  const sinU1 = Math.sin(u1), sinU2 = Math.sin(u2);
  const cosU1cosU2 = cosU1 * cosU2;
  const sinU1sinU2 = sinU1 * sinU2;
  let sigma = 0.0, deltaSigma = 0.0;
  let lambda = l;
  for (let iter = 0; iter < MAXITERS; iter++) {
    const lambdaOrig = lambda;
    const cosLambda = Math.cos(lambda);
    const sinLambda = Math.sin(lambda);
    const t1 = cosU2 * sinLambda;
    const t2 = cosU1 * sinU2 - sinU1 * cosU2 * cosLambda;
    const sinSqSigma = t1 * t1 + t2 * t2;
    const sinSigma = Math.sqrt(sinSqSigma);
    const cosSigma = sinU1sinU2 + cosU1cosU2 * cosLambda;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlpha = sinSigma === 0 ? 0.0 : (cosU1cosU2 * sinLambda) / sinSigma;
    const cosSqAlpha = 1.0 - sinAlpha * sinAlpha;
    const cos2SM = cosSqAlpha === 0 ? 0.0 : cosSigma - (2.0 * sinU1sinU2) / cosSqAlpha;
    const uSquared = cosSqAlpha * aSqMinusBSqOverBSq;
    aA = 1 + (uSquared / 16384.0) * (4096.0 + uSquared * (-768 + uSquared * (320.0 - 175.0 * uSquared)));
    const bB = (uSquared / 1024.0) * (256.0 + uSquared * (-128.0 + uSquared * (74.0 - 47.0 * uSquared)));
    const cC = (f / 16.0) * cosSqAlpha * (4.0 + f * (4.0 - 3.0 * cosSqAlpha));
    const cos2SMSq = cos2SM * cos2SM;
    deltaSigma = bB * sinSigma * (cos2SM + (bB / 4.0) * (cosSigma * (-1.0 + 2.0 * cos2SMSq) -
      (bB / 6.0) * cos2SM * (-3.0 + 4.0 * sinSigma * sinSigma) * (-3.0 + 4.0 * cos2SMSq)));
    lambda = l + (1.0 - cC) * f * sinAlpha * (sigma + cC * sinSigma * (cos2SM + cC * cosSigma * (-1.0 + 2.0 * cos2SM * cos2SM)));
    const delta = (lambda - lambdaOrig) / lambda;
    if (Math.abs(delta) < 1.0e-12) break;
  }
  return Math.fround(b * aA * (sigma - deltaSigma));
}

/** Metres between two {lat, lng} objects. */
export const dist = (p, q) => distanceBetween(p.lat, p.lng, q.lat, q.lng);

/**
 * Nearest route index to `p` inside [from, to] (inclusive), like the app's
 * findNearestRouteIndexInWindow. Ties keep the earliest index.
 */
export function nearestIndexInWindow(route, p, from, to) {
  let best = Math.max(0, from);
  let bestD = Infinity;
  const end = Math.min(to, route.length - 1);
  for (let i = Math.max(0, from); i <= end; i++) {
    const d = dist(p, route[i]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** Cumulative metres along a polyline: cum[0] = 0, cum[i] = length up to point i. */
export function cumulative(points) {
  const cum = new Array(points.length);
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += dist(points[i - 1], points[i]);
    cum[i] = total;
  }
  return cum;
}

// Local flat projection around a point, in metres. Good to well under a metre
// over a few hundred metres, which is all the segment projection below needs.
function toLocal(origin, p) {
  const kx = 111320 * Math.cos(origin.lat * RAD);
  return { x: (p.lng - origin.lng) * kx, y: (p.lat - origin.lat) * 110540 };
}

/**
 * Where `p` sits along the route, in metres from the start, refined between
 * route points: we know the nearest point index, then project onto the two
 * segments either side of it. This is what makes the live delta smooth rather
 * than jumping from point to point.
 */
export function alongRoute(route, cum, idx, p) {
  let bestAlong = cum[idx];
  let bestD = Infinity;
  for (const s of [idx - 1, idx]) {
    if (s < 0 || s + 1 >= route.length) continue;
    const a = route[s], b = route[s + 1];
    const A = { x: 0, y: 0 };
    const B = toLocal(a, b);
    const P = toLocal(a, p);
    const len2 = B.x * B.x + B.y * B.y;
    let t = len2 > 0 ? (P.x * B.x + P.y * B.y) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = P.x - (A.x + t * B.x), dy = P.y - (A.y + t * B.y);
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; bestAlong = cum[s] + t * (cum[s + 1] - cum[s]); }
  }
  return bestAlong;
}

/** Compass bearing name in Hungarian, from degrees. */
export function compassHu(deg) {
  if (deg == null || Number.isNaN(deg)) return "–";
  const names = ["É", "ÉK", "K", "DK", "D", "DNy", "Ny", "ÉNy"];
  return names[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

/** Total km of a list of recorded samples, point to point. */
export function totalKm(samples) {
  let m = 0;
  for (let i = 1; i < samples.length; i++) m += dist(samples[i - 1], samples[i]);
  return m / 1000;
}
