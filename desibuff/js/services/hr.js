// services/hr.js
// Heart rate over Bluetooth, using the standard Heart Rate service that the
// CYCPLUS H1 (and almost every strap or armband) speaks. Works in Chrome on
// Android and on desktop Chrome/Edge. iPhones have no Web Bluetooth at all.
//
// Status: "unsupported" | "off" | "connecting" | "on" | "reconnecting"

export const hrSupported = () => typeof navigator !== "undefined" && !!navigator.bluetooth;

/** Parse a Heart Rate Measurement (0x2A37) value. */
export function parseHeartRate(dv) {
  const flags = dv.getUint8(0);
  const bpm = flags & 0x01 ? dv.getUint16(1, true) : dv.getUint8(1);
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : true;
  return { bpm, contact };
}

export function createHeartRate({ onBpm, onStatus }) {
  let device = null;
  let char = null;
  let status = hrSupported() ? "off" : "unsupported";
  let wantConnected = false;
  let retry = 0;
  let retryTimer = null;
  let sim = null;
  let battery = null;

  const setStatus = (s) => { status = s; onStatus?.(s, { name: device?.name || (sim ? "Szimulált pulzus" : null), battery }); };

  function onValue(e) {
    const { bpm, contact } = parseHeartRate(e.target.value);
    if (contact && bpm > 0) onBpm(bpm, Date.now());
  }

  async function connectGatt() {
    if (!device) return;
    setStatus(retry ? "reconnecting" : "connecting");
    try {
      const server = await device.gatt.connect();
      const svc = await server.getPrimaryService("heart_rate");
      char = await svc.getCharacteristic("heart_rate_measurement");
      char.addEventListener("characteristicvaluechanged", onValue);
      await char.startNotifications();
      try {
        const bs = await server.getPrimaryService("battery_service");
        const lvl = await (await bs.getCharacteristic("battery_level")).readValue();
        battery = lvl.getUint8(0);
      } catch { battery = null; }
      retry = 0;
      setStatus("on");
    } catch (err) {
      console.warn("HR connect failed", err);
      scheduleRetry();
    }
  }

  function scheduleRetry() {
    if (!wantConnected || !device) { setStatus("off"); return; }
    clearTimeout(retryTimer);
    const wait = [1000, 2000, 4000, 8000, 15000][Math.min(retry, 4)];
    retry++;
    setStatus("reconnecting");
    retryTimer = setTimeout(connectGatt, wait);
  }

  function onDisconnected() {
    char = null;
    if (wantConnected) scheduleRetry(); else setStatus("off");
  }

  function adopt(d) {
    if (device && device !== d) device.removeEventListener("gattserverdisconnected", onDisconnected);
    device = d;
    device.addEventListener("gattserverdisconnected", onDisconnected);
  }

  return {
    get status() { return status; },
    get name() { return device?.name || (sim ? "Szimulált pulzus" : null); },
    get battery() { return battery; },

    /** Must be called from a tap: Chrome shows its device picker. */
    async pick() {
      if (!hrSupported()) { setStatus("unsupported"); return false; }
      try {
        const d = await navigator.bluetooth.requestDevice({ filters: [{ services: ["heart_rate"] }], optionalServices: ["battery_service"] });
        adopt(d);
        wantConnected = true;
        retry = 0;
        await connectGatt();
        return true;
      } catch (err) {
        if (err?.name !== "NotFoundError") console.warn(err); // NotFoundError = picker closed
        setStatus(device ? status : "off");
        return false;
      }
    },

    /** Reconnect silently to a device this site was allowed before (where Chrome supports it). */
    async tryRemembered() {
      if (!hrSupported() || !navigator.bluetooth.getDevices) return false;
      try {
        const list = await navigator.bluetooth.getDevices();
        if (!list.length) return false;
        adopt(list[0]);
        wantConnected = true;
        await connectGatt();
        return status === "on";
      } catch { return false; }
    },

    disconnect() {
      wantConnected = false;
      clearTimeout(retryTimer);
      if (sim) { clearInterval(sim); sim = null; }
      try { device?.gatt?.disconnect(); } catch { /* already gone */ }
      setStatus(hrSupported() ? "off" : "unsupported");
    },

    /** Fake heart rate for testing on a desktop. */
    simulate(on) {
      if (sim) { clearInterval(sim); sim = null; }
      if (!on) { setStatus(device ? status : hrSupported() ? "off" : "unsupported"); return; }
      let phase = 0;
      // sweeps slowly from about 95 to 170 bpm, so every zone and the bar get exercised
      sim = setInterval(() => { phase += 0.04; onBpm(Math.round(132 + Math.sin(phase) * 32 + Math.sin(phase * 3.1) * 6), Date.now()); }, 1000);
      setStatus("on");
    },
  };
}

// Zones live in engine/zones.js.
