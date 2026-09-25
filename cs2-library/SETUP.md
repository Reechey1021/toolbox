# Setting up sharing (about 10 minutes, all free)

Three parts: the security rules, somewhere for clips to live, then choosing who can add. Until you do these, the library works exactly as before, everything on this device.

## 1. The security rules (2 minutes)

1. Open `firestore.rules` (in this folder). It's the whole project's rules, darts included.
2. Near the bottom, find `your.email@gmail.com` and replace it with **your** Google email, in lower case. That makes you the admin.
3. Firebase console, **Firestore Database**, **Rules**: delete what's there, paste the whole file, **Publish**.

## 2. Clip hosting: Cloudinary's free tier (5 minutes)

Firebase's own file storage needs the paid plan, so clips go to Cloudinary (free: 25 GB a month of storage and viewing combined, plenty for 5-second clips).

1. Sign up at <https://cloudinary.com> (free plan, no card). Your **cloud name** is on the dashboard.
2. **Settings** (gear icon), **Upload**, **Upload presets**, **Add upload preset**:
   - Signing mode: **Unsigned**
   - Preset name: `cs2-library`
   - Folder: `cs2-library`
   - Under upload control / restrictions (wording varies): allowed formats `mp4, webm, mov, jpg, png, webp` (videos, and images for instant smokes), and a maximum file size of about **20 MB**
   - Save.
3. Open `js/config/clips-config.js` and fill it in:

```js
export const clipHost = {
  cloudName: "your-cloud-name",
  uploadPreset: "cs2-library",
  folder: "cs2-library",
};
```

A note on the unsigned preset: it's designed for uploading straight from a browser, so anyone who digs the preset name out of the page could upload a file into that folder. The restrictions above (videos only, size cap, one folder) keep that harmless, and the library only lists clips that contributors add.

## 3. Who can add lineups (1 minute)

1. Open the library, **Sign in with Google** (bottom of the menu).
2. Go to **Add content**: it offers **Set up access**. Press it: you're the admin (the rules only allow your email to do this).
3. **Settings**, **Who can add lineups**: add your friends' Google emails as contributors.
4. Lineups already saved on this PC: **Settings** has **Publish the lineups on this device**, which uploads their clips and adds them to the shared library.

Everyone else can browse, watch and keep **favourites** (they just sign in); only contributors see the add form.

## Firebase usage

Very light: the library is read once per visit (one small document per lineup), favourites are one tiny document each, spawns one per map and side, callouts one per map, and clips never touch Firebase. Nowhere near the free limits.

## Cloudinary usage

Each clip is downloaded once per device and then played from the browser's cache, so a 5 MB clip costs 5 MB per person, ever, not per play. The free plan's monthly allowance covers thousands of first views.
