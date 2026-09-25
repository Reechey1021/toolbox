# Convert

One box: type "100km to yards", "68F to C", "5ft 10in to cm", "12st 7lb to kg", "1 PB in GB", "50 mpg to L/100km"... and the answer appears underneath. Type just an amount ("100 kg") to see it in every unit of its kind.

Only things that never change: length, area, volume (UK and US), mass, temperature, time, speed, data (decimal kB and binary KiB, bits and bytes), data rates, pressure, energy, power, angle, frequency, force, torque, fuel economy (UK and US mpg, L/100km, km/L). No currencies or prices.

UK by default where it matters: "gallon", "pint" and "fl oz" are UK (say "US gallon" for US); "cup" is US; "ton" is the UK long ton ("tonne" is metric). A month and a year are Gregorian averages.

Add a unit in `js/units.js` (one line: category, symbol, name, size, aliases). Tests: `node convert/tests/run.mjs`.
