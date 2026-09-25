// services/cloud/index.js
// Picks the backend: real Firebase when a config exists, the fake one when the
// address has ?fakecloud (testing only), otherwise none at all.

import { firebaseConfig } from "../../config/firebase-config.js";

let backendPromise = null;

function wantsFake() {
  try {
    if (new URLSearchParams(location.search).has("fakecloud")) sessionStorage.setItem("reechDarts:fakecloud", "1");
    return sessionStorage.getItem("reechDarts:fakecloud") === "1";
  } catch {
    return false;
  }
}

export function cloudAvailable() {
  return Boolean(firebaseConfig) || wantsFake();
}

// Resolves to the backend, or null when accounts aren't set up (or the SDK can't load, e.g. offline).
export function getBackend() {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    if (wantsFake()) return (await import("./fake.js")).createFakeBackend();
    if (!firebaseConfig) return null;
    try {
      return await (await import("./firebase.js")).createFirebaseBackend(firebaseConfig);
    } catch (err) {
      console.warn("Firebase couldn't load, carrying on offline", err);
      backendPromise = null; // try again later
      return null;
    }
  })();
  return backendPromise;
}
