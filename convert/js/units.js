// js/units.js
// Every unit that never changes, and the parser that turns "100km to yards"
// into an answer. Pure: no DOM.
//
// Each unit: [category, symbol, name (plural), size in the category's base unit,
// "the|ways|people|type|it"]. Aliases are matched exactly first (so MB and Mb
// differ), then ignoring case.

const RAW = [
  // Length (metres)
  ["Length", "nm", "nanometres", 1e-9, "nanometre|nanometer|nanometers"],
  ["Length", "µm", "micrometres", 1e-6, "um|micron|microns|micrometre|micrometer|micrometers"],
  ["Length", "mm", "millimetres", 0.001, "millimetre|millimeter|millimeters"],
  ["Length", "cm", "centimetres", 0.01, "centimetre|centimeter|centimeters"],
  ["Length", "m", "metres", 1, "metre|meter|meters|mtr"],
  ["Length", "km", "kilometres", 1000, "kilometre|kilometer|kilometers|kms|klick|klicks"],
  ["Length", "mil", "mils (thou)", 0.0000254, "thou|mils"],
  ["Length", "in", "inches", 0.0254, "inch|\"|''"],
  ["Length", "ft", "feet", 0.3048, "foot|'"],
  ["Length", "yd", "yards", 0.9144, "yard|yds"],
  ["Length", "mi", "miles", 1609.344, "mile|mls"],
  ["Length", "nmi", "nautical miles", 1852, "nautical mile|nauticalmile|nautical miles"],
  ["Length", "hand", "hands", 0.1016, "hands"],
  ["Length", "fathom", "fathoms", 1.8288, "fathoms|ftm"],
  ["Length", "chain", "chains", 20.1168, "chains"],
  ["Length", "furlong", "furlongs", 201.168, "furlongs|fur"],
  ["Length", "league", "leagues", 4828.032, "leagues"],
  ["Length", "au", "astronomical units", 149597870700, "astronomical unit|AU"],
  ["Length", "ly", "light years", 9460730472580800, "light year|lightyear|lightyears|light-year|light-years"],
  ["Length", "pc", "parsecs", 30856775814913673, "parsec|parsecs"],
  // Mass (kilograms)
  ["Mass", "µg", "micrograms", 1e-9, "ug|mcg|microgram|micrograms"],
  ["Mass", "mg", "milligrams", 1e-6, "milligram|milligramme|milligrams"],
  ["Mass", "g", "grams", 0.001, "gram|gramme|grammes|gr"],
  ["Mass", "kg", "kilograms", 1, "kilogram|kilogramme|kilo|kilos|kgs"],
  ["Mass", "t", "tonnes", 1000, "tonne|metric ton|metric tons|metric tonne"],
  ["Mass", "ct", "carats", 0.0002, "carat|carats"],
  ["Mass", "grain", "grains", 0.00006479891, "grains"],
  ["Mass", "oz", "ounces", 0.028349523125, "ounce|ozs"],
  ["Mass", "ozt", "troy ounces", 0.0311034768, "troy ounce|troy ounces|troy oz"],
  ["Mass", "lb", "pounds", 0.45359237, "lbs|pound|pounds|lbm"],
  ["Mass", "st", "stone", 6.35029318, "stone|stones|stn"],
  ["Mass", "short ton", "US tons (short)", 907.18474, "short ton|short tons|us ton|us tons"],
  ["Mass", "long ton", "UK tons (long)", 1016.0469088, "long ton|long tons|uk ton|uk tons|ton|tons"],
  // Volume (litres)
  ["Volume", "ml", "millilitres", 0.001, "millilitre|milliliter|milliliters|mL|cc|ccs"],
  ["Volume", "cl", "centilitres", 0.01, "centilitre|centiliter|centiliters"],
  ["Volume", "dl", "decilitres", 0.1, "decilitre|deciliter|deciliters"],
  ["Volume", "l", "litres", 1, "litre|liter|liters|ltr|ltrs|L"],
  ["Volume", "tsp", "teaspoons (US)", 0.00492892159375, "teaspoon|teaspoons|tsps"],
  ["Volume", "tbsp", "tablespoons (US)", 0.01478676478125, "tablespoon|tablespoons|tbsps|tbs"],
  ["Volume", "fl oz", "fluid ounces (UK)", 0.0284130625, "floz|fluid ounce|fluid ounces|uk fl oz|imperial fl oz"],
  ["Volume", "US fl oz", "fluid ounces (US)", 0.0295735295625, "us floz|us fluid ounce|us fluid ounces"],
  ["Volume", "cup", "cups (US)", 0.2365882365, "cups|us cup|us cups"],
  ["Volume", "metric cup", "metric cups", 0.25, "metric cups"],
  ["Volume", "pt", "pints (UK)", 0.56826125, "pint|pints|uk pint|uk pints|imperial pint|imperial pints"],
  ["Volume", "US pt", "pints (US)", 0.473176473, "us pint|us pints"],
  ["Volume", "qt", "quarts (UK)", 1.1365225, "quart|quarts|uk quart|uk quarts"],
  ["Volume", "US qt", "quarts (US)", 0.946352946, "us quart|us quarts"],
  ["Volume", "gal", "gallons (UK)", 4.54609, "gallon|gallons|uk gal|uk gallon|uk gallons|imperial gallon|imperial gallons"],
  ["Volume", "US gal", "gallons (US)", 3.785411784, "us gallon|us gallons"],
  ["Volume", "bbl", "barrels (oil)", 158.987294928, "barrel|barrels"],
  // Area (square metres): squares of lengths are added below
  ["Area", "ha", "hectares", 10000, "hectare|hectares|hectar"],
  ["Area", "acre", "acres", 4046.8564224, "acres|ac"],
  // Temperature (special: see TEMPS)
  ["Temperature", "°C", "degrees Celsius", null, "c|celsius|centigrade|degc|deg c|degrees c|degree c|degrees celsius|degree celsius"],
  ["Temperature", "°F", "degrees Fahrenheit", null, "f|fahrenheit|degf|deg f|degrees f|degree f|degrees fahrenheit|degree fahrenheit"],
  ["Temperature", "K", "kelvin", null, "k|kelvin|kelvins|degrees kelvin"],
  ["Temperature", "°R", "degrees Rankine", null, "r|rankine|degrees rankine"],
  // Time (seconds). A month and a year are the Gregorian averages.
  ["Time", "ns", "nanoseconds", 1e-9, "nanosecond|nanoseconds"],
  ["Time", "µs", "microseconds", 1e-6, "us|microsecond|microseconds"],
  ["Time", "ms", "milliseconds", 0.001, "millisecond|milliseconds|msec"],
  ["Time", "s", "seconds", 1, "sec|secs|second|seconds"],
  ["Time", "min", "minutes", 60, "mins|minute|minutes"],
  ["Time", "h", "hours", 3600, "hr|hrs|hour|hours"],
  ["Time", "day", "days", 86400, "d|days"],
  ["Time", "week", "weeks", 604800, "wk|wks|weeks"],
  ["Time", "fortnight", "fortnights", 1209600, "fortnights"],
  ["Time", "month", "months (average)", 2629746, "mo|mos|months|mth|mths"],
  ["Time", "year", "years (average)", 31556952, "yr|yrs|years|y"],
  ["Time", "decade", "decades", 315569520, "decades"],
  ["Time", "century", "centuries", 3155695200, "centuries"],
  ["Time", "millennium", "millennia", 31556952000, "millennia|millenniums"],
  // Speed (metres per second)
  ["Speed", "m/s", "metres per second", 1, "mps|metres per second|meters per second|meter per second|metre per second"],
  ["Speed", "km/h", "kilometres per hour", 1 / 3.6, "kmh|kph|kmph|km/hr|kilometres per hour|kilometers per hour|kilometre per hour"],
  ["Speed", "mph", "miles per hour", 0.44704, "mi/h|miles per hour|mile per hour"],
  ["Speed", "kn", "knots", 0.514444444444, "knot|knots|kt|kts"],
  ["Speed", "ft/s", "feet per second", 0.3048, "fps|feet per second|foot per second"],
  // Data (bytes). Decimal (kB = 1,000 bytes) and binary (KiB = 1,024).
  ["Data", "bit", "bits", 0.125, "bits|b"],
  ["Data", "B", "bytes", 1, "byte|bytes"],
  ["Data", "kB", "kilobytes", 1e3, "KB|kb|kilobyte|kilobytes"],
  ["Data", "MB", "megabytes", 1e6, "mb|megabyte|megabytes|meg|megs"],
  ["Data", "GB", "gigabytes", 1e9, "gb|gigabyte|gigabytes|gig|gigs"],
  ["Data", "TB", "terabytes", 1e12, "tb|terabyte|terabytes"],
  ["Data", "PB", "petabytes", 1e15, "pb|petabyte|petabytes"],
  ["Data", "EB", "exabytes", 1e18, "eb|exabyte|exabytes"],
  ["Data", "ZB", "zettabytes", 1e21, "zb|zettabyte|zettabytes"],
  ["Data", "YB", "yottabytes", 1e24, "yb|yottabyte|yottabytes"],
  ["Data", "KiB", "kibibytes", 1024, "kib|kibibyte|kibibytes"],
  ["Data", "MiB", "mebibytes", 1024 ** 2, "mib|mebibyte|mebibytes"],
  ["Data", "GiB", "gibibytes", 1024 ** 3, "gib|gibibyte|gibibytes"],
  ["Data", "TiB", "tebibytes", 1024 ** 4, "tib|tebibyte|tebibytes"],
  ["Data", "PiB", "pebibytes", 1024 ** 5, "pib|pebibyte|pebibytes"],
  ["Data", "kbit", "kilobits", 125, "Kb|kilobit|kilobits|kbits"],
  ["Data", "Mbit", "megabits", 125000, "Mb|megabit|megabits|mbits"],
  ["Data", "Gbit", "gigabits", 1.25e8, "Gb|gigabit|gigabits|gbits"],
  ["Data", "Tbit", "terabits", 1.25e11, "Tb|terabit|terabits"],
  // Data rate (bits per second)
  ["Data rate", "bps", "bits per second", 1, "bit/s|bits per second"],
  ["Data rate", "kbps", "kilobits per second", 1e3, "kbit/s|kb/s|kilobits per second"],
  ["Data rate", "Mbps", "megabits per second", 1e6, "mbps|mbit/s|mb/s|megabits per second"],
  ["Data rate", "Gbps", "gigabits per second", 1e9, "gbps|gbit/s|gigabits per second"],
  ["Data rate", "kB/s", "kilobytes per second", 8e3, "KB/s|kBps|kilobytes per second"],
  ["Data rate", "MB/s", "megabytes per second", 8e6, "MBps|megabytes per second"],
  ["Data rate", "GB/s", "gigabytes per second", 8e9, "GBps|gigabytes per second"],
  // Pressure (pascals)
  ["Pressure", "Pa", "pascals", 1, "pa|pascal|pascals"],
  ["Pressure", "hPa", "hectopascals", 100, "hpa|hectopascal|hectopascals"],
  ["Pressure", "kPa", "kilopascals", 1000, "kpa|kilopascal|kilopascals"],
  ["Pressure", "MPa", "megapascals", 1e6, "mpa|megapascal|megapascals"],
  ["Pressure", "mbar", "millibars", 100, "millibar|millibars|mb pressure"],
  ["Pressure", "bar", "bar", 100000, "bars"],
  ["Pressure", "psi", "pounds per square inch", 6894.757293168, "PSI|lbf/in2|pounds per square inch"],
  ["Pressure", "atm", "atmospheres", 101325, "atmosphere|atmospheres"],
  ["Pressure", "mmHg", "millimetres of mercury", 133.322387415, "mmhg|torr"],
  ["Pressure", "inHg", "inches of mercury", 3386.389, "inhg"],
  // Energy (joules)
  ["Energy", "J", "joules", 1, "j|joule|joules"],
  ["Energy", "kJ", "kilojoules", 1000, "kj|kilojoule|kilojoules"],
  ["Energy", "MJ", "megajoules", 1e6, "mj|megajoule|megajoules"],
  ["Energy", "cal", "calories", 4.184, "calorie|calories|gram calorie"],
  ["Energy", "kcal", "kilocalories (food calories)", 4184, "Cal|kilocalorie|kilocalories|food calories|food calorie"],
  ["Energy", "Wh", "watt-hours", 3600, "wh|watt hour|watt hours|watt-hour|watt-hours"],
  ["Energy", "kWh", "kilowatt-hours", 3.6e6, "kwh|kilowatt hour|kilowatt hours|kilowatt-hour|kilowatt-hours|units of electricity"],
  ["Energy", "BTU", "British thermal units", 1055.05585262, "btu|btus"],
  ["Energy", "therm", "therms", 105505585.262, "therms"],
  ["Energy", "eV", "electronvolts", 1.602176634e-19, "ev|electronvolt|electronvolts|electron volt|electron volts"],
  ["Energy", "ft·lbf", "foot-pounds (energy)", 1.3558179483314004, "ftlbf|ft-lbf|foot-pound|foot-pounds"],
  // Power (watts)
  ["Power", "W", "watts", 1, "w|watt|watts"],
  ["Power", "kW", "kilowatts", 1000, "kw|kilowatt|kilowatts"],
  ["Power", "MW", "megawatts", 1e6, "mw|megawatt|megawatts"],
  ["Power", "hp", "horsepower", 745.69987158227022, "HP|bhp|horsepower|horse power|mechanical horsepower"],
  ["Power", "PS", "metric horsepower (PS)", 735.49875, "ps|metric horsepower|pferdestarke|cv"],
  ["Power", "BTU/h", "BTU per hour", 0.29307107017, "btu/h|btu/hr|btuh"],
  // Angle (degrees)
  ["Angle", "°", "degrees", 1, "deg|degs|degree|degrees"],
  ["Angle", "rad", "radians", 180 / Math.PI, "radian|radians|rads"],
  ["Angle", "grad", "gradians", 0.9, "gradian|gradians|gon|grads"],
  ["Angle", "arcmin", "arcminutes", 1 / 60, "arcminute|arcminutes|′"],
  ["Angle", "arcsec", "arcseconds", 1 / 3600, "arcsecond|arcseconds|″"],
  ["Angle", "turn", "turns", 360, "turns|rev|revs|revolution|revolutions"],
  // Frequency (hertz)
  ["Frequency", "Hz", "hertz", 1, "hz|hertz"],
  ["Frequency", "kHz", "kilohertz", 1e3, "khz|kilohertz"],
  ["Frequency", "MHz", "megahertz", 1e6, "mhz|megahertz"],
  ["Frequency", "GHz", "gigahertz", 1e9, "ghz|gigahertz"],
  ["Frequency", "rpm", "revolutions per minute", 1 / 60, "RPM|revolutions per minute"],
  // Force (newtons)
  ["Force", "N", "newtons", 1, "newton|newtons"],
  ["Force", "kN", "kilonewtons", 1000, "kn force|kilonewton|kilonewtons"],
  ["Force", "lbf", "pounds-force", 4.4482216152605, "pound-force|pounds-force|pound force|pounds force"],
  ["Force", "kgf", "kilograms-force", 9.80665, "kilogram-force|kilograms-force|kilopond|kp"],
  ["Force", "dyn", "dynes", 1e-5, "dyne|dynes"],
  // Torque (newton-metres)
  ["Torque", "N·m", "newton-metres", 1, "Nm|N m|N-m|newton metre|newton metres|newton meter|newton meters|newton-metre|newton-metres"],
  ["Torque", "lb·ft", "pound-feet", 1.3558179483314004, "lbft|lb ft|lb-ft|ft lb|ftlb|ft-lb|pound feet|pound-feet|foot pound|foot pounds"],
  ["Torque", "kgf·m", "kilogram-force metres", 9.80665, "kgfm|kgf m|kgf-m"],
  // Fuel economy (special: see ECONOMY)
  ["Fuel economy", "mpg", "miles per gallon (UK)", null, "mpg uk|uk mpg|mpg (uk)|miles per gallon|miles per uk gallon|imperial mpg"],
  ["Fuel economy", "US mpg", "miles per gallon (US)", null, "mpg us|us mpg|mpg (us)|miles per us gallon"],
  ["Fuel economy", "L/100km", "litres per 100 km", null, "l/100km|l/100 km|l per 100km|litres per 100km|liters per 100km|litres per 100 km"],
  ["Fuel economy", "km/L", "kilometres per litre", null, "km/l|kmpl|kilometres per litre|kilometers per liter"],
];

// Squares and cubes of lengths: m², sq ft, cubic inches...
const POWERED = [
  ["mm", "millimetres"],
  ["cm", "centimetres"],
  ["m", "metres"],
  ["km", "kilometres", false],
  ["in", "inches"],
  ["ft", "feet"],
  ["yd", "yards"],
  ["mi", "miles", false],
];
for (const [sym, name, cube = true] of POWERED) {
  const len = RAW.find((u) => u[0] === "Length" && u[1] === sym);
  const a = [sym, ...len[4].split("|").filter((x) => /^[a-z]+$/i.test(x))];
  RAW.push(["Area", `${sym}²`, `square ${name}`, len[3] ** 2, a.flatMap((x) => [`${x}2`, `${x}^2`, `sq ${x}`, `sq${x}`, `square ${x}`, `square ${x}s`, `${x} squared`]).join("|")]);
  if (cube) {
    const l = sym === "cm" || sym === "mm" || sym === "m" || sym === "in" || sym === "ft" || sym === "yd";
    if (l) RAW.push(["Volume", `${sym}³`, `cubic ${name}`, (len[3] ** 3) * 1000, a.flatMap((x) => [`${x}3`, `${x}^3`, `cu ${x}`, `cubic ${x}`, `cubic ${x}s`, `${x} cubed`]).join("|")]);
  }
}

// Temperature and fuel economy aren't simple multiples.
const TEMPS = {
  "°C": [(v) => v, (c) => c],
  "°F": [(v) => ((v - 32) * 5) / 9, (c) => (c * 9) / 5 + 32],
  K: [(v) => v - 273.15, (c) => c + 273.15],
  "°R": [(v) => ((v - 491.67) * 5) / 9, (c) => ((c + 273.15) * 9) / 5],
};
const ECONOMY = {
  // to and from litres per 100 km (the higher the mpg, the lower the L/100km)
  mpg: [(v) => 282.480936331822 / v, (l) => 282.480936331822 / l],
  "US mpg": [(v) => 235.214583333333 / v, (l) => 235.214583333333 / l],
  "L/100km": [(v) => v, (l) => l],
  "km/L": [(v) => 100 / v, (l) => 100 / l],
};

export const UNITS = RAW.map(([cat, sym, name, size, aliases]) => ({ cat, sym, name, size, aliases: aliases ? aliases.split("|") : [] }));
export const CATEGORIES = [...new Set(UNITS.map((u) => u.cat))];

const exact = new Map();
const loose = new Map();
for (const u of UNITS) {
  for (const a of [u.sym, u.name, ...u.aliases]) {
    if (!exact.has(a)) exact.set(a, u);
    const k = a.toLowerCase();
    if (!loose.has(k)) loose.set(k, u);
  }
}

// "Kilometres", "km", "KM", "degrees F", "sq ft"... -> a unit, or null.
export function findUnit(text) {
  let t = String(text || "").trim().replace(/\s+/g, " ").replace(/\.$/, "");
  if (!t) return null;
  if (exact.has(t)) return exact.get(t);
  const l = t.toLowerCase().replace(/^(a |an |one )/, "");
  if (loose.has(l)) return loose.get(l);
  const noDeg = l.replace(/^(degrees?|deg|°)\s*/, "");
  if (noDeg !== l && loose.has(noDeg)) return loose.get(noDeg);
  if (l.endsWith("es") && loose.has(l.slice(0, -2))) return loose.get(l.slice(0, -2));
  if (l.endsWith("s") && loose.has(l.slice(0, -1))) return loose.get(l.slice(0, -1));
  return null;
}

// Convert a value between two units of the same category.
export function convert(value, from, to) {
  if (from.cat !== to.cat) return null;
  if (from.cat === "Temperature") return TEMPS[to.sym][1](TEMPS[from.sym][0](value));
  if (from.cat === "Fuel economy") return value === 0 ? null : ECONOMY[to.sym][1](ECONOMY[from.sym][0](value));
  return (value * from.size) / to.size;
}

// The joining word; the space after it isn't consumed, so "in to" finds both.
const SEP = /\s+(?:to|in|into|as|=|->|→|>)(?=\s)/i;
const NUM = "[-+]?(?:\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)(?:e[-+]?\\d+)?";

// "100km to yards" -> { value, from, to } | { error } | null (nothing typed yet)
export function parse(input) {
  let s = String(input || "").trim().replace(/[×]/g, "x");
  if (!s) return null;
  // Split at the last joining word: "3 in to cm" is 3 inches, to centimetres.
  let target = null;
  const all = [...s.matchAll(new RegExp(SEP.source, "gi"))];
  const last = all[all.length - 1];
  if (last) {
    target = s.slice(last.index + last[0].length).trim();
    s = s.slice(0, last.index);
  }
  const num = (x) => Number(String(x).replace(/,/g, ""));
  // 5ft 10in, 5'10", 12st 7lb: two-part amounts
  let m = new RegExp(`^(${NUM})\\s*(?:ft|feet|foot|')\\s*(${NUM})\\s*(?:in|inch|inches|"|'')?$`, "i").exec(s);
  if (m) return finish(num(m[1]) * 12 + num(m[2]), findUnit("in"), target, `${m[1]} ft ${m[2]} in`);
  m = new RegExp(`^(${NUM})\\s*(?:st|stone|stones)\\s*(${NUM})\\s*(?:lb|lbs|pounds?)?$`, "i").exec(s);
  if (m) return finish(num(m[1]) * 14 + num(m[2]), findUnit("lb"), target, `${m[1]} st ${m[2]} lb`);
  m = new RegExp(`^(${NUM})\\s*(.+)$`, "i").exec(s);
  if (!m) return { error: "Start with a number, like \u201c100 km to miles\u201d." };
  const from = findUnit(m[2]);
  if (!from) return { error: `I don't know the unit \u201c${m[2].trim()}\u201d.` };
  return finish(num(m[1]), from, target);
}

function finish(value, from, targetText, label = null) {
  if (!isFinite(value)) return { error: "That number doesn't look right." };
  if (targetText === null) return { value, from, to: null, label };
  const to = findUnit(targetText);
  if (!to) return { error: `I don't know the unit \u201c${targetText.trim()}\u201d.` };
  if (to.cat !== from.cat) return { error: `${from.name} are ${from.cat.toLowerCase()} and ${to.name} are ${to.cat.toLowerCase()}: they don't convert.` };
  return { value, from, to, label };
}

// Friendly numbers: 1,093.6133 · 0.00012 · 1.2346 × 10¹⁵
const SUP = { "-": "\u207b", 0: "\u2070", 1: "\u00b9", 2: "\u00b2", 3: "\u00b3", 4: "\u2074", 5: "\u2075", 6: "\u2076", 7: "\u2077", 8: "\u2078", 9: "\u2079" };
export function format(n) {
  if (n === null || !isFinite(n)) return "\u2013";
  if (n === 0) return "0";
  const a = Math.abs(n);
  if (a >= 1e15 || a < 1e-6) {
    const [mant, exp] = n.toExponential(5).split("e");
    return `${Number(mant)} \u00d7 10${String(Number(exp)).split("").map((c) => SUP[c] ?? c).join("")}`;
  }
  return n.toLocaleString("en-GB", { maximumSignificantDigits: a >= 1 ? Math.max(8, Math.floor(Math.log10(a)) + 3) : 6 });
}
