# Fuel cost

What a trip costs in fuel: distance (miles or km, return trip, split between people), your car (name, petrol or diesel, MPG / L/100 km / km/L), and the country (UK or Hungary). The result is in the country's currency, and you can switch it (pounds, forints, euros).

- **Fuel prices** are recent national averages, with their source and date (there's no free live price feed a website can call). Tap the price to use today's; it's remembered. Hungary's average is in euros (the EU Weekly Oil Bulletin) and shown in forints at today's rate.
- **Exchange rates** are the European Central Bank's daily rates, via Frankfurter (free, no key), kept for 12 hours.
- **Settings** (the icon top-right): distance unit, how fuel economy is shown, default country.

Everything's saved in this browser. Add a country in `js/data.js` (its currency, reference prices, date and source). Tests: `node fuel/tests/run.mjs`.
