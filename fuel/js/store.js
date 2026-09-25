// js/store.js
// Cars, settings, your own prices and the last trip, kept in this browser.

const P = "reechFuel:";
const read = (k, fallback) => {
  try {
    const v = localStorage.getItem(P + k);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(P + k, JSON.stringify(v));
  } catch {
    /* private mode */
  }
};

export const DEFAULT_SETTINGS = { distanceUnit: "mi", efficiencyUnit: "mpg", country: "GB" };
export const settings = () => ({ ...DEFAULT_SETTINGS, ...read("settings", {}) });
export const saveSettings = (patch) => write("settings", { ...settings(), ...patch });

// cars: [{ id, name, fuel, l100 }] (efficiency kept as litres per 100 km)
export const cars = () => read("cars", []);
export const saveCars = (list) => write("cars", list);
export const newId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Your own price per litre, by country and fuel, in the country's currency.
export const priceOverrides = () => read("prices", {});
export const setPriceOverride = (country, fuel, value) => {
  const p = priceOverrides();
  p[country] = { ...(p[country] || {}) };
  if (value === null) delete p[country][fuel];
  else p[country][fuel] = { value, at: Date.now() };
  write("prices", p);
};

export const lastTrip = () => read("trip", {});
export const saveTrip = (t) => write("trip", t);
