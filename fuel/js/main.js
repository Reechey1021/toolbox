// js/main.js
// Fuel cost: how much a trip costs in fuel, for your car, in the UK or Hungary,
// in whichever currency you want to see it in.

import { h, replaceChildren } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { openSheet, segmented, stepper, switchRow, toast, confirm } from "./ui/components.js";
import { COUNTRIES, countryById, CURRENCIES, FUELS, EFFICIENCY_UNITS, litresPer100km, fromLitresPer100km, tripCost, convert, formatMoney, formatEfficiency, gradesFor, gradeName } from "./data.js";
import { getRates } from "./rates.js";
import * as store from "./store.js";

const app = document.getElementById("app");
let rates = { base: "EUR", rates: { GBP: 0.87, HUF: 395 }, approximate: true };
const s0 = store.settings();
const trip = { distance: "", distanceUnit: s0.distanceUnit, returnTrip: false, split: 1, carId: null, country: s0.country, currency: null, grades: {}, ...store.lastTrip() };
trip.grades ??= {};
// The grade you fill this car with (remembered per car); its family's standard grade to begin with.
const gradeOf = (car) => (car && gradesFor(car.fuel).some((g) => g.id === trip.grades[car.id]) ? trip.grades[car.id] : car?.fuel);

// The price per litre in the country's own currency: yours if you've set one, else the
// published average (null when there isn't one for this grade).
function priceFor(country, grade) {
  const own = store.priceOverrides()[country.id]?.[grade];
  if (own) return { value: own.value, own: true, at: own.at };
  const ref = country.ref?.[grade];
  if (ref === null || ref === undefined) return { value: null, own: false };
  const value = country.refCurrency === country.currency ? ref : convert(ref, country.refCurrency, country.currency, rates);
  return { value, own: false };
}

const card = (title, ...body) => h("section", { class: "fcard" }, title ? h("h2", { class: "fcard__title" }, title) : null, ...body);
const field = (label, control) => h("label", { class: "ffield" }, h("span", { class: "ffield__label" }, label), control);

function render() {
  const settings = store.settings();
  const list = store.cars();
  if (!list.find((c) => c.id === trip.carId)) trip.carId = list[0]?.id ?? null;
  const car = list.find((c) => c.id === trip.carId) ?? null;
  const country = countryById(trip.country);
  const currency = trip.currency && CURRENCIES[trip.currency] ? trip.currency : country.currency;
  store.saveTrip({ distance: trip.distance, distanceUnit: trip.distanceUnit, returnTrip: trip.returnTrip, split: trip.split, carId: trip.carId, country: trip.country, currency: trip.currency, grades: trip.grades });

  // 1. Distance
  const distance = h("input", {
    class: "field fbig",
    type: "number",
    inputmode: "decimal",
    min: 0,
    placeholder: "0",
    value: trip.distance,
    "aria-label": "Distance",
    oninput: (e) => ((trip.distance = e.target.value), paintResult()),
  });
  const distCard = card(
    "Distance",
    h(
      "div",
      { class: "frow" },
      distance,
      segmented({
        label: "Unit",
        value: trip.distanceUnit,
        options: [
          { value: "mi", label: "Miles" },
          { value: "km", label: "km" },
        ],
        onChange: (v) => ((trip.distanceUnit = v), render()),
      })
    ),
    h("div", { class: "rows" }, switchRow({ label: "Return trip", hint: "There and back: double the distance.", checked: trip.returnTrip, onChange: (v) => ((trip.returnTrip = v), paintResult()) })),
    h("div", { class: "frow frow--split" }, h("span", { class: "ffield__label" }, "Split between"), stepper({ value: trip.split, min: 1, max: 8, label: "people", format: (n) => `${n} ${n === 1 ? "person" : "people"}`, onChange: (v) => ((trip.split = v), paintResult()) }))
  );

  // 2. Car
  const carSel = h(
    "select",
    { class: "field select", "aria-label": "Car", disabled: !list.length, onchange: (e) => ((trip.carId = e.target.value), render()) },
    list.length ? list.map((c) => h("option", { value: c.id, selected: c.id === trip.carId }, c.name)) : h("option", null, "No cars yet")
  );
  const carCard = card(
    "Car",
    h("div", { class: "frow" }, carSel, h("button", { class: "btn btn--quiet fadd", type: "button", onclick: () => editCar() }, icon("plus", { size: 18 }), h("span", { class: "btn__label" }, "Add"))),
    car
      ? h(
          "div",
          { class: "fcar" },
          h("span", { class: "fcar__info" }, `${FUELS.find((f) => f.id === car.fuel)?.name}, ${formatEfficiency(car.l100, settings.efficiencyUnit)}`),
          h("button", { class: "btn btn--quiet fsmall", type: "button", onclick: () => editCar(car) }, "Edit")
        )
      : h("p", { class: "muted" }, "Add your car: a name, petrol or diesel, and its MPG (or L/100 km)."),
    car
      ? field(
          "Fuel type",
          h(
            "select",
            { class: "field select", "aria-label": "Fuel type", onchange: (e) => ((trip.grades = { ...trip.grades, [car.id]: e.target.value }), render()) },
            gradesFor(car.fuel).map((g) => h("option", { value: g.id, selected: g.id === gradeOf(car) }, gradeName(country, g.id)))
          )
        )
      : null
  );

  // 3. Country and its fuel price
  const grade = gradeOf(car);
  const price = car ? priceFor(country, grade) : null;
  const countryCard = card(
    "Country",
    h(
      "select",
      { class: "field select", "aria-label": "Country", onchange: (e) => ((trip.country = e.target.value), (trip.currency = null), render()) },
      COUNTRIES.map((c) => h("option", { value: c.id, selected: c.id === country.id }, c.name))
    ),
    car
      ? h(
          "button",
          { class: ["fprice", price.value === null && "is-missing"], type: "button", onclick: () => editPrice(country, grade) },
          h("span", { class: "fprice__main" }, price.value === null ? `${gradeName(country, grade)}: no average` : `${gradeName(country, grade)}: ${formatMoney(price.value, country.currency)}/L`),
          h("span", { class: "fprice__sub" }, price.own ? `Your price, set ${new Date(price.at).toLocaleDateString("en-GB")} · tap to change` : price.value === null ? `There's no published average for this in ${country.name}: tap to set today's price` : `Average, ${country.refDate} · tap to use today's price`)
        )
      : null
  );

  // 4. The result
  resultBox = h("section", { class: "fresult", "aria-live": "polite" });
  replaceChildren(
    app,
    h(
      "main",
      { class: "page fpage" },
      h("header", { class: "fhead" }, h("a", { class: "icon-btn", href: "../", "aria-label": "Reech's Toolbox" }, icon("back")), h("h1", { class: "fhead__title" }, "Fuel cost"), h("button", { class: "icon-btn", type: "button", "aria-label": "Settings", onclick: openSettings }, icon("sliders"))),
      distCard,
      carCard,
      countryCard,
      resultBox
    )
  );
  paintResult();
}

let resultBox = null;
function paintResult() {
  const list = store.cars();
  const car = list.find((c) => c.id === trip.carId);
  const country = countryById(trip.country);
  const currency = trip.currency && CURRENCIES[trip.currency] ? trip.currency : country.currency;
  store.saveTrip({ ...store.lastTrip(), distance: trip.distance, returnTrip: trip.returnTrip, split: trip.split });
  const curSel = h(
    "select",
    { class: "field select fcur", "aria-label": "Currency", onchange: (e) => ((trip.currency = e.target.value), paintResult()) },
    Object.entries(CURRENCIES).map(([code, c]) => h("option", { value: code, selected: code === currency }, `${code} · ${c.name}`))
  );
  if (!car || !(Number(trip.distance) > 0)) {
    return replaceChildren(resultBox, h("p", { class: "fresult__empty" }, !car ? "Add a car to see the cost." : "Enter a distance to see the cost."), curSel);
  }
  const grade = gradeOf(car);
  const price = priceFor(country, grade);
  if (price.value === null) return replaceChildren(resultBox, h("p", { class: "fresult__empty" }, `Set today's price for ${gradeName(country, grade).toLowerCase()} (tap it above) to see the cost.`), curSel);
  const t = tripCost({ distance: trip.distance, distanceUnit: trip.distanceUnit, efficiency: car.l100, efficiencyUnit: "l100", pricePerLitre: price.value, returnTrip: trip.returnTrip });
  const cost = t ? convert(t.cost, country.currency, currency, rates) : null;
  const each = cost !== null && trip.split > 1 ? cost / trip.split : null;
  const rateLine =
    currency !== country.currency
      ? `1 ${country.currency} = ${convert(1, country.currency, currency, rates)?.toFixed(currency === "HUF" ? 2 : 5)} ${currency}`
      : country.currency !== "GBP"
        ? `1 GBP = ${convert(1, "GBP", country.currency, rates)?.toFixed(2)} ${country.currency}`
        : null;
  replaceChildren(
    resultBox,
    h("p", { class: "fresult__label" }, trip.returnTrip ? "Fuel for the return trip" : "Fuel for the trip"),
    h("p", { class: "fresult__cost num" }, formatMoney(cost, currency)),
    each !== null ? h("p", { class: "fresult__each" }, `${formatMoney(each, currency)} each, split ${trip.split} ways`) : null,
    h("p", { class: "fresult__meta" }, `${t.litres.toFixed(1)} litres · ${trip.distanceUnit === "mi" ? (t.km / 1.609344).toFixed(0) + " mi" : t.km.toFixed(0) + " km"} · ${formatEfficiency(car.l100, store.settings().efficiencyUnit)}`),
    h("div", { class: "fresult__cur" }, h("span", { class: "ffield__label" }, "Show in"), curSel),
    rateLine || rates.approximate || rates.stale
      ? h("p", { class: "fresult__rates" }, [rateLine, rates.approximate ? "rough rates (offline)" : rates.stale ? `rates from ${rates.date}` : rates.date ? `ECB rates, ${rates.date}` : null].filter(Boolean).join(" · "))
      : null
  );
}

// ---------------------------------------------------------------- sheets

function editCar(car = null) {
  const s = store.settings();
  const unit0 = s.efficiencyUnit;
  const name = h("input", { class: "field", type: "text", maxlength: 30, value: car?.name ?? "", placeholder: "e.g. Golf", "aria-label": "Name" });
  let fuel = car?.fuel ?? "petrol";
  let unit = unit0;
  const value = h("input", { class: "field", type: "number", inputmode: "decimal", min: 0, step: "0.1", value: car ? fromLitresPer100km(car.l100, unit0).toFixed(1) : "", placeholder: unit0 === "mpg" ? "e.g. 45" : "e.g. 6.2", "aria-label": "Fuel economy" });
  const unitSel = h(
    "select",
    {
      class: "field select",
      "aria-label": "Unit",
      onchange: (e) => {
        // Keep the same economy when the unit changes: convert what's typed.
        const l100 = litresPer100km(value.value, unit);
        unit = e.target.value;
        if (l100) value.value = fromLitresPer100km(l100, unit).toFixed(1);
      },
    },
    EFFICIENCY_UNITS.map((u) => h("option", { value: u.id, selected: u.id === unit0 }, u.name))
  );
  const sheet = openSheet({
    title: car ? "Edit car" : "Add a car",
    body: [
      field("Name", name),
      field("Fuel", segmented({ label: "Fuel", value: fuel, options: FUELS.map((f) => ({ value: f.id, label: f.name })), onChange: (v) => (fuel = v) })),
      field("Fuel economy", h("div", { class: "frow" }, value, unitSel)),
    ],
    actions: [
      h(
        "button",
        {
          class: "btn btn--primary btn--block",
          type: "button",
          onclick: () => {
            const l100 = litresPer100km(value.value, unit);
            if (!name.value.trim()) return toast("Give it a name", { tone: "bad" });
            if (!l100) return toast("Enter its fuel economy", { tone: "bad" });
            const list = store.cars();
            const rec = { id: car?.id ?? store.newId(), name: name.value.trim(), fuel, l100 };
            store.saveCars(car ? list.map((c) => (c.id === car.id ? rec : c)) : [...list, rec]);
            trip.carId = rec.id;
            sheet.close();
            render();
          },
        },
        car ? "Save" : "Add car"
      ),
      car
        ? h(
            "button",
            {
              class: "btn btn--ghost btn--block",
              type: "button",
              onclick: async () => {
                sheet.close();
                if (!(await confirm({ title: `Remove ${car.name}?`, confirmLabel: "Remove", tone: "danger" }))) return;
                store.saveCars(store.cars().filter((c) => c.id !== car.id));
                render();
              },
            },
            "Remove this car"
          )
        : null,
    ],
  });
  setTimeout(() => name.focus(), 200);
}

function editPrice(country, fuel) {
  const cur = priceFor(country, fuel);
  const c = CURRENCIES[country.currency];
  const shown = cur.value === null ? "" : c.decimals ? cur.value.toFixed(3) : Math.round(cur.value);
  const input = h("input", { class: "field fbig", type: "number", inputmode: "decimal", min: 0, step: c.decimals ? "0.001" : "1", value: shown, placeholder: c.decimals ? "e.g. 1.799" : "e.g. 720", "aria-label": "Price per litre" });
  const ref = priceFor({ ...country, id: "__ref" }, fuel);
  const sheet = openSheet({
    title: `${gradeName(country, fuel)} in ${country.name}`,
    lead:
      ref.value === null
        ? `Per litre, in ${c.name.toLowerCase()}s. There's no published national average for this grade, so enter today's pump price: it's remembered.`
        : `Per litre, in ${c.name.toLowerCase()}s. The average (${formatMoney(ref.value, country.currency)}, ${country.refDate}) comes from the ${country.source}.`,
    body: input,
    actions: [
      h(
        "button",
        {
          class: "btn btn--primary btn--block",
          type: "button",
          onclick: () => {
            const v = Number(input.value);
            if (!(v > 0)) return toast("Enter a price", { tone: "bad" });
            store.setPriceOverride(country.id, fuel, v);
            sheet.close();
            render();
          },
        },
        "Use this price"
      ),
      cur.own ? h("button", { class: "btn btn--ghost btn--block", type: "button", onclick: () => (store.setPriceOverride(country.id, fuel, null), sheet.close(), render()) }, ref.value === null ? "Clear my price" : "Back to the average") : null,
    ],
  });
  setTimeout(() => (input.focus(), input.select()), 200);
}

function openSettings() {
  const s = store.settings();
  openSheet({
    title: "Settings",
    body: [
      field("Distance in", segmented({ label: "Distance in", value: s.distanceUnit, options: [{ value: "mi", label: "Miles" }, { value: "km", label: "Kilometres" }], onChange: (v) => (store.saveSettings({ distanceUnit: v }), (trip.distanceUnit = v), render()) })),
      field("Show fuel economy as", segmented({ label: "Fuel economy", value: s.efficiencyUnit, className: "seg--wrap", options: EFFICIENCY_UNITS.map((u) => ({ value: u.id, label: u.name })), onChange: (v) => (store.saveSettings({ efficiencyUnit: v }), render()) })),
      field("Default country", segmented({ label: "Default country", value: s.country, options: COUNTRIES.map((c) => ({ value: c.id, label: c.name })), onChange: (v) => store.saveSettings({ country: v }) })),
      h("p", { class: "muted fnote" }, "Fuel prices are recent national averages (there's no free live feed a website can use); tap a price to use today's. Exchange rates are the European Central Bank's, updated daily."),
    ],
  });
}

render();
getRates().then((r) => {
  rates = r;
  render();
});
