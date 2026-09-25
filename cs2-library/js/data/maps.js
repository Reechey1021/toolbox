// data/maps.js
// The maps, their images and their callouts.
//
// Images come from MurkyYT/cs2-map-icons (auto-extracted from the game files on
// every CS2 update). Radars are 1024 x 1024.
//
// overview: the numbers from game/csgo/resource/overviews/<map>.txt that turn
// game coordinates (from getpos) into radar pixels:
//   pixel x = (worldX - x) / scale        pixel y = (y - worldY) / scale
// These are the long-standing values; "verified: false" means not yet checked
// against the CS2 files. Only getpos placement uses them.

// Every image is looked for in this folder's maps/ first (run tools/download-maps.ps1
// to fill it), then on GitHub, so nothing breaks before you've downloaded them.
const REMOTE = "https://raw.githubusercontent.com/MurkyYT/cs2-map-icons/main/images";
const LOCAL = new URL("../../maps/", import.meta.url).href;
const pair = (file) => ({ local: LOCAL + file, remote: `${REMOTE}/${file}` });

export const RADAR_SIZE = 1024;

export const MAPS = [
  {
    id: "de_mirage",
    name: "Mirage",
    overview: { x: -3230, y: 1713, scale: 5.0, verified: false },
    callouts: [
      "T Spawn", "T Ramp", "Palace", "A Ramp", "Tetris", "Sandwich", "A Site", "Default (A)", "Firebox", "Triple Box",
      "Ticket Booth", "Stairs", "Jungle", "Connector", "CT Spawn", "Top Mid", "Mid", "Window", "Short", "Catwalk",
      "Underpass", "Ladder Room", "Chair", "B Apartments", "Balcony", "B Site", "Van", "Bench", "Market", "Kitchen",
      "B Short", "Top Cat", "House",
    ],
  },
  {
    id: "de_dust2",
    name: "Dust II",
    overview: { x: -2476, y: 3239, scale: 4.4, verified: false },
    callouts: ["T Spawn", "Outside Long", "Long Doors", "Blue", "Pit", "Long A", "A Site", "Goose", "A Car", "Short", "A Ramp", "Xbox", "Mid", "Mid Doors", "CT Spawn", "Lower Tunnels", "Upper Tunnels", "B Site", "B Doors", "B Window", "Back Plat", "B Car"],
  },
  {
    id: "de_inferno",
    name: "Inferno",
    overview: { x: -2087, y: 3870, scale: 4.9, verified: false },
    callouts: ["T Spawn", "T Ramp", "Second Mid", "Mid", "Top Mid", "Arch", "Library", "Pit", "Graveyard", "A Site", "Balcony", "Apartments", "Boiler", "Short", "Long", "Banana", "Car", "Logs", "Coffins", "B Site", "New Box", "Fountain", "CT Spawn", "Construction", "Dark", "Church"],
  },
  {
    id: "de_ancient",
    name: "Ancient",
    overview: { x: -2953, y: 2164, scale: 5.0, verified: false },
    callouts: ["T Spawn", "Mid", "Donut", "Cave", "B Ramp", "B Main", "B Site", "B Short", "CT Spawn", "A Main", "A Site", "Temple", "Elbow", "House", "Red Room", "Ruins"],
  },
  {
    id: "de_cache",
    name: "Cache",
    overview: { x: -2000, y: 3250, scale: 5.5, verified: false },
    callouts: ["T Spawn", "A Main", "A Site", "Quad", "Truck", "Squeaky", "Mid", "Garage", "White Box", "Z Connector", "Vents", "B Main", "B Site", "Checkers", "Headshot", "CT Spawn"],
  },
  {
    id: "de_train",
    name: "Train",
    overview: { x: -2308, y: 2078, scale: 4.082, verified: false },
    callouts: ["T Spawn", "T Main", "Ivy", "Popdog", "A Site", "Ladder Room", "Connector", "Z Connector", "B Halls", "Upper B", "Lower B", "B Site", "CT Spawn", "Heaven", "Hell", "Sandwich"],
  },
  {
    id: "de_nuke",
    name: "Nuke",
    overview: { x: -3453, y: 2887, scale: 7.0, verified: false, lowerBelowZ: -495 },
    lowerRadar: "de_nuke_lower_radar_psd",
    callouts: ["T Spawn", "Outside", "Lobby", "Squeaky", "Hut", "A Site", "Heaven", "Hell", "Mini", "Ramp", "B Site", "Secret", "Vents", "Silo", "Garage", "CT Spawn"],
  },
  {
    id: "de_overpass",
    name: "Overpass",
    overview: { x: -4831, y: 1781, scale: 5.2, verified: false },
    callouts: ["T Spawn", "Fountain", "Park", "Toilets", "Long A", "A Site", "Bank", "Truck", "Connector", "Monster", "Water", "Short", "B Site", "Heaven", "Pillar", "CT Spawn"],
  },
  {
    id: "de_vertigo",
    name: "Vertigo",
    overview: { x: -3168, y: 1762, scale: 4.0, verified: false, lowerBelowZ: 11700 },
    lowerRadar: "de_vertigo_lower_radar_psd",
    callouts: ["T Spawn", "A Ramp", "A Site", "Scaffolding", "Elevator", "Mid", "B Stairs", "B Site", "Generator", "CT Spawn"],
  },
  {
    id: "de_anubis",
    name: "Anubis",
    overview: { x: -2796, y: 3328, scale: 5.22, verified: false },
    callouts: ["T Spawn", "A Main", "A Site", "Heaven", "Connector", "Mid", "Canal", "Bridge", "B Main", "B Site", "Palace", "Street", "CT Spawn"],
  },
].map((m) => ({
  ...m,
  icon: pair(`${m.id}.png`),
  thumb: pair(`thumbs/${m.id}_1_png.png`),
  radar: pair(`radars/${m.id}_radar_psd.png`),
  lowerRadar: m.lowerRadar ? pair(`radars/${m.lowerRadar}.png`) : null,
}));

// An <img> that tries your local copy, then GitHub.
export function imageSrc(img, p) {
  img.src = p.local;
  img.addEventListener("error", function retry() {
    if (img.src !== p.remote) img.src = p.remote;
    else img.removeEventListener("error", retry), (img.hidden = true);
  });
  return img;
}

export const mapById = (id) => MAPS.find((m) => m.id === id) ?? null;
