// services/account.js
// Who you are here. Anyone with the link can browse; signing in with Google adds
// favourites; contributors (a list the admin keeps) can add lineups. The admin is
// whoever sets up access first, and the Firestore rules only allow your email to
// do that (see SETUP.md).

import { getCloud, cloudAvailable } from "./cloud.js";

let state = { status: cloudAvailable() ? "loading" : "off", user: null, access: null, favourites: new Set() };
const listeners = new Set();
export const accountState = () => ({ ...state, contributor: isContributor(), admin: isAdmin() });
export function onAccount(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const emit = () => listeners.forEach((fn) => fn(accountState()));

function isAdmin() {
  return Boolean(state.user && state.access?.admins?.includes(state.user.email));
}
function isContributor() {
  return Boolean(state.user && (isAdmin() || state.access?.contributors?.includes(state.user.email)));
}

export async function initAccount() {
  if (!cloudAvailable()) return emit();
  const cloud = await getCloud();
  if (!cloud) {
    state = { ...state, status: "offline" };
    return emit();
  }
  cloud.onUser(async (u) => {
    state = { ...state, user: u, status: "loading" };
    emit();
    const [access, favs] = await Promise.all([cloud.getAccess().catch(() => null), u ? cloud.listFavourites(u.uid).catch(() => []) : []]);
    state = { ...state, access, favourites: new Set(favs), status: u ? "signed-in" : "guest" };
    emit();
  });
}

export async function signIn() {
  const cloud = await getCloud();
  if (!cloud) throw new Error("Couldn't reach Google. Check your connection.");
  await cloud.signIn();
}
export async function signOut() {
  (await getCloud())?.signOut();
}

// First time only: you become the admin (the rules only let your email do this).
export async function setUpAccess() {
  const cloud = await getCloud();
  const access = { admins: [state.user.email], contributors: [] };
  await cloud.setAccess(access);
  state = { ...state, access };
  emit();
}

async function writeAccess(next) {
  const cloud = await getCloud();
  await cloud.setAccess(next);
  state = { ...state, access: next };
  emit();
}
export function addContributor(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error("That doesn't look like an email address.");
  const list = [...new Set([...(state.access?.contributors ?? []), e])];
  return writeAccess({ ...state.access, contributors: list });
}
export function removeContributor(email) {
  return writeAccess({ ...state.access, contributors: (state.access?.contributors ?? []).filter((x) => x !== email) });
}

export const isFavourite = (id) => state.favourites.has(id);
export async function toggleFavourite(id) {
  if (!state.user) throw new Error("Sign in to keep favourites.");
  const cloud = await getCloud();
  const on = !state.favourites.has(id);
  await cloud.setFavourite(state.user.uid, id, on);
  const favs = new Set(state.favourites);
  on ? favs.add(id) : favs.delete(id);
  state = { ...state, favourites: favs };
  emit();
  return on;
}
