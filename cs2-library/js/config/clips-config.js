// config/clips-config.js
// Where shared clips are uploaded: Cloudinary's free tier (see SETUP.md).
// While this is null, new lineups are saved on this device only, as before.
//
// These values aren't secret: an "unsigned upload preset" is meant to be used
// from a browser. Lock it down in Cloudinary (videos only, one folder, a size
// limit), as SETUP.md describes.

export const clipHost = null;

// Once set up, it looks like this:
// export const clipHost = {
//   cloudName: "your-cloud-name",
//   uploadPreset: "cs2-library",
//   folder: "cs2-library",
// };
