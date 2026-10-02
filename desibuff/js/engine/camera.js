// engine/camera.js
// The live map's camera: where to look and how to turn so that his direction
// of travel points up and his blip sits low in the frame (more road ahead).
// Uses Web Mercator with 512-pixel tiles, the same as MapLibre, so the street
// map underneath and the lines drawn on top always line up. Pure module.

const RAD = Math.PI / 180;
const TILE = 512;

export const mercX = (lng) => (lng + 180) / 360;
export function mercY(lat) {
  const r = Math.max(-85.05, Math.min(85.05, lat)) * RAD;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2;
}
export const fromMerc = (x, y) => ({ lng: x * 360 - 180, lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) });

/** Signed smallest turn from a to b, in degrees (−180..180). */
export const angleDiff = (a, b) => ((((b - a) % 360) + 540) % 360) - 180;

/** Compass bearing from p to q, in degrees. */
export function bearingTo(p, q) {
  const y = Math.sin((q.lng - p.lng) * RAD) * Math.cos(q.lat * RAD);
  const x = Math.cos(p.lat * RAD) * Math.sin(q.lat * RAD) - Math.sin(p.lat * RAD) * Math.cos(q.lat * RAD) * Math.cos((q.lng - p.lng) * RAD);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

/** Closer in when slow, further out when fast: about 30 s of road ahead at any speed. */
export const zoomForSpeed = (kmh) => Math.max(14.8, Math.min(17.2, 17.2 - (kmh || 0) / 16));

/**
 * camera({ rider, bearing, zoom, w, h, blipY })
 *   center   lat/lng to give the street map
 *   project  (mercX, mercY) -> [x, y] screen pixels
 */
export function camera({ rider, bearing, zoom, w, h, blipY = 0.68 }) {
  const size = TILE * 2 ** zoom;
  const th = bearing * RAD, c = Math.cos(th), s = Math.sin(th);
  const rx = mercX(rider.lng) * size, ry = mercY(rider.lat) * size;
  const ahead = (blipY - 0.5) * h; // the centre sits this many px ahead of him
  const cx = rx + ahead * s, cy = ry - ahead * c;
  const project = (mx, my) => {
    const dx = mx * size - cx, dy = my * size - cy;
    return [w / 2 + dx * c + dy * s, h / 2 - dx * s + dy * c];
  };
  return { center: fromMerc(cx / size, cy / size), project, size };
}
