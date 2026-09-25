// js/data.js
// Countries, fuel prices, units and the maths. Pure: no DOM, no storage.

// Reference average pump prices (per litre, including tax). There's no free live
// feed a website can call for these, so they're researched values you can
// overwrite with today's price in the app.
export const COUNTRIES = [
  {
    id: "GB",
    name: "United Kingdom",
    currency: "GBP",
    grades: { petrol: "Unleaded (E10)", super: "Super unleaded (E5, 97\u201399)", diesel: "Diesel", superdiesel: "Premium diesel" },
    ref: { petrol: 1.576, super: 1.747, diesel: 1.754, superdiesel: 1.942 },
    refCurrency: "GBP",
    refDate: "26 Jul 2026",
    source: "UK weekly averages from the government's Fuel Finder data (fuel-finder.uk)",
  },
  {
    id: "HU",
    name: "Hungary",
    currency: "HUF",
    grades: { petrol: "95 (Euro 95)", super: "100 octane (premium)", diesel: "Diesel", superdiesel: "Premium diesel" },
    // Only 95 and diesel have a published national average.
    ref: { petrol: 1.71, super: null, diesel: 1.92, superdiesel: null },
    refCurrency: "EUR",
    refDate: "14 Sep 2026",
    source: "EU Weekly Oil Bulletin average (fuel-prices.eu), converted at today's rate",
  },
];
export const countryById = (id) => COUNTRIES.find((c) => c.id === id) ?? COUNTRIES[0];

export const CURRENCIES = {
  GBP: { symbol: "£", name: "British pound", decimals: 2 },
  HUF: { symbol: "Ft", name: "Hungarian forint", decimals: 0, after: true },
  EUR: { symbol: "€", name: "Euro", decimals: 2 },
};

// What a car runs on (its family), and the grades you can fill it with.
export const FUELS = [
  { id: "petrol", name: "Petrol" },
  { id: "diesel", name: "Diesel" },
];
export const GRADES = [
  { id: "petrol", family: "petrol" },
  { id: "super", family: "petrol" },
  { id: "diesel", family: "diesel" },
  { id: "superdiesel", family: "diesel" },
];
export const gradesFor = (family) => GRADES.filter((g) => g.family === family);
export const gradeName = (country, id) => country.grades?.[id] ?? id;

export const EFFICIENCY_UNITS = [
  { id: "mpg", name: "MPG (UK)" },
  { id: "l100", name: "L/100 km" },
  { id: "kml", name: "km/L" },
];

const UK_GALLON = 4.54609;
const KM_PER_MILE = 1.609344;

// Any efficiency as litres per 100 km (the one the maths uses).
export function litresPer100km(value, unit) {
  const v = Number(value);
  if (!(v > 0)) return null;
  if (unit === "l100") return v;
  if (unit === "kml") return 100 / v;
  return (100 * UK_GALLON) / (v * KM_PER_MILE); // mpg (UK gallons)
}

// And back, for showing it in your preferred unit.
export function fromLitresPer100km(l100, unit) {
  if (!(l100 > 0)) return null;
  if (unit === "l100") return l100;
  if (unit === "kml") return 100 / l100;
  return (100 * UK_GALLON) / (l100 * KM_PER_MILE);
}

export const toKm = (distance, unit) => (unit === "mi" ? Number(distance) * KM_PER_MILE : Number(distance));

// The trip: litres needed and what they cost (in the price's currency).
export function tripCost({ distance, distanceUnit, efficiency, efficiencyUnit, pricePerLitre, returnTrip = false }) {
  const l100 = litresPer100km(efficiency, efficiencyUnit);
  const km = toKm(distance, distanceUnit) * (returnTrip ? 2 : 1);
  if (!l100 || !(km > 0) || !(pricePerLitre > 0)) return null;
  const litres = (km * l100) / 100;
  return { km, litres, cost: litres * pricePerLitre };
}

// rates: { base: "EUR", rates: { GBP, HUF, EUR: 1 } }
export function convert(amount, from, to, rates) {
  if (from === to) return amount;
  const r = { ...rates.rates, [rates.base]: 1 };
  if (!r[from] || !r[to]) return null;
  return (amount / r[from]) * r[to];
}

export function formatMoney(amount, currency) {
  const c = CURRENCIES[currency] ?? { symbol: currency, decimals: 2 };
  if (amount === null || amount === undefined || !isFinite(amount)) return "–";
  const n = amount.toLocaleString("en-GB", { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
  return c.after ? `${n} ${c.symbol}` : `${c.symbol}${n}`;
}

export function formatEfficiency(l100, unit) {
  const v = fromLitresPer100km(l100, unit);
  if (v === null) return "–";
  const name = EFFICIENCY_UNITS.find((u) => u.id === unit)?.name ?? unit;
  return `${v.toFixed(unit === "mpg" ? 1 : 1)} ${name}`;
}
