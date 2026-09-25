// node fuel/tests/run.mjs
import { litresPer100km, fromLitresPer100km, tripCost, convert, formatMoney, toKm, gradesFor, COUNTRIES } from "../js/data.js";
let passed = 0, failed = 0;
const ok = (c, m) => (c ? passed++ : (failed++, console.log("  FAIL", m)));
const near = (a, b, m, t = 0.01) => ok(Math.abs(a - b) < t, `${m}: ${a} vs ${b}`);

near(litresPer100km(50, "mpg"), 5.65, "50 MPG (UK) is about 5.65 L/100 km");
near(litresPer100km(20, "kml"), 5, "20 km/L is 5 L/100 km");
near(fromLitresPer100km(litresPer100km(42, "mpg"), "mpg"), 42, "MPG round trip");
near(toKm(100, "mi"), 160.934, "100 miles in km");
const t = tripCost({ distance: 100, distanceUnit: "mi", efficiency: 50, efficiencyUnit: "mpg", pricePerLitre: 1.5 });
near(t.litres, 9.09, "100 miles at 50 MPG: 9.09 litres (100 / 50 gallons)");
near(t.cost, 13.64, "at £1.50 a litre: £13.64");
near(tripCost({ distance: 100, distanceUnit: "km", efficiency: 6, efficiencyUnit: "l100", pricePerLitre: 600, returnTrip: true }).cost, 7200, "return trip doubles it");
ok(tripCost({ distance: 0, distanceUnit: "km", efficiency: 6, efficiencyUnit: "l100", pricePerLitre: 1 }) === null, "no distance, no result");
const rates = { base: "EUR", rates: { GBP: 0.85, HUF: 400 } };
near(convert(1, "EUR", "HUF", rates), 400, "EUR to HUF");
near(convert(1, "GBP", "HUF", rates), 470.59, "GBP to HUF through EUR");
near(convert(470.59, "HUF", "GBP", rates), 1, "and back");
ok(formatMoney(1234.5, "GBP") === "£1,234.50" && formatMoney(12345.6, "HUF") === "12,346 Ft", "money formats (forints without decimals)");
ok(JSON.stringify(gradesFor("petrol").map((g) => g.id)) === '["petrol","super"]' && JSON.stringify(gradesFor("diesel").map((g) => g.id)) === '["diesel","superdiesel"]', "grades by fuel");
ok(COUNTRIES.every((c) => ["petrol", "super", "diesel", "superdiesel"].every((g) => c.grades[g] && g in c.ref)), "every country names every grade (a missing average is null)");
ok(COUNTRIES.find((c) => c.id === "GB").ref.super > COUNTRIES.find((c) => c.id === "GB").ref.petrol, "super unleaded costs more than E10");
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
