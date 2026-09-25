# Setting up Google sign-in (about 10 minutes)

This switches on accounts in Reech Darts: Google sign-in, your matches backed up and synced between devices, and later friends and online play. It uses Firebase's free **Spark** plan. No card needed, and nothing here ever needs the paid plan. If Firebase ever offers an upgrade, you can ignore it.

Until you finish these steps, the app works exactly as before, entirely on your device.

---

## 1. Create the project

1. Go to <https://console.firebase.google.com> and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it, for example `reechs-toolbox`, and continue.
4. Turn **Google Analytics off** (not needed), then **Create project**.

## 2. Add a web app

1. On the project overview page, click the **web icon** (`</>`).
2. Nickname: `Reech Darts`. Leave **Firebase Hosting unticked**.
3. Click **Register app**. You'll see a block of code containing `const firebaseConfig = { ... }`. Keep this page open for the next step.

## 3. Paste the config into the app

1. Open `darts/js/config/firebase-config.js`.
2. Replace `export const firebaseConfig = null;` with the object from Firebase, so it looks like this:

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "reechs-toolbox.firebaseapp.com",
  projectId: "reechs-toolbox",
  storageBucket: "reechs-toolbox.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abc123",
};
```

These values aren't secret. They only say which project to use. Your data is protected by the rules in step 6.

## 4. Switch on Google sign-in

1. In the left menu: **Build**, then **Authentication**, then **Get started**.
2. **Sign-in method** tab, then **Google**, then **Enable**.
3. Pick your email as the **support email**, then **Save**.

## 5. Allow your addresses

Still in Authentication: **Settings** tab, then **Authorized domains**, then **Add domain**. Add:

- `127.0.0.1` (VS Code's Live Server uses this; `localhost` is already listed)
- your GitHub Pages address, e.g. `yourusername.github.io` (just the domain, no `https://`, no folder)

## 6. Create the database

1. Left menu: **Build**, then **Firestore Database**, then **Create database**.
2. Location: **`europe-west2` (London)**. This can't be changed later.
3. Choose **Start in production mode**, then **Create**.
4. Open the **Rules** tab, delete what's there, paste in everything from `firestore.rules` (in the project folder), then **Publish**.

## 7. Try it

1. Run the app with Live Server as usual.
2. Tap your avatar (top right on the home screen), then **Sign in with Google**.
3. Choose your account in the popup. The app asks whether to bring your matches with you.
4. The dashboard should say **"Everything's backed up to your account."** In Firebase, **Firestore Database, Data** tab, you'll see a `users` collection with your profile and matches in it.

Push the changes to GitHub and it works on your live site too.

---

## If something goes wrong

- **"auth/unauthorized-domain"**: the address you're on isn't in step 5's list. Add exactly what's in your browser's address bar (for Live Server, `127.0.0.1`).
- **Nothing happens when tapping sign in**: your browser blocked the popup. Allow popups for the site; the app also falls back to a full-page sign-in on its own.
- **"Missing or insufficient permissions"**: the rules from step 6 weren't published. Paste them in and press **Publish** again.
- **On iPhone, as an installed home-screen app**: the installed app keeps its own sign-in, separate from Safari, so sign in from inside it. If the Google page doesn't hand you back to the app, tell me. The fix is to also host the app on Firebase Hosting (still free), which makes Google sign-in smoother on iPhones.

## Free plan limits, for peace of mind

The Spark plan allows 50,000 reads and 20,000 writes a day. One finished match is one write. You'd have to play thousands of matches a day to get anywhere near it.
