# Doxa
*δόξα — glory, praise.* A worship songwriting web app. No AI: rhymes, synonyms and line hints all come from data bundled in the app, so it works offline.

## Use it
- **Songs list:** tap **＋ New song**. Use ⋯ on a song to rename, duplicate or delete it.
- **Sections:** tap a section chip (VERSE 1, CHORUS…) to change its type. Use ↑ ↓ to reorder and ⋯ to duplicate or delete. The buttons under the song add sections.
- **Key:** the top bar shows the song's key (or **Key** if you haven't set one). Tap it and pick a major or minor key. It's saved on the song.
- **Bold:** select some text, then tap **Bold** in the menu that appears.
- **Word help:** select a word and pick **Rhyme**, **Synonym** or **Worship words** from the menu. A sheet slides up from the bottom.
  - **Rhyme** adds the word you tap to the end of the *next* line. If there isn't one, it starts a new line.
  - **Synonym** and **Worship words** replace the word you selected.
- **Hints** (off by default): the **Hints** button turns line suggestions off completely, or on. When they're on, finishing a line offers 2–3 short worship lines you can tap to insert. They follow the previous line's length and rhyme, and they stay with the images already in the song. If those lines lean on Scripture (light, a shepherd, mercy, the cross, living water, a throng), the suggestions prefer short singable echoes of that image. Lines that miss both the rhyme and the image are left out. No verse numbers, no account, no network, no AI. Tap ✕ to hide that set.
- Songs you have not shared are saved on the device (localStorage, key `doxa-v1`), including each song's key. They keep working offline with no account. Dark mode follows the system setting.
- **Account** (top right) is for sharing a song with the team. Until Firebase is connected, that screen explains the setup and local songs are unchanged.

## Share songs (free)
Collaboration uses the free Firebase Spark plan: email-and-password accounts, and Firestore for live edits. There is no paid service and no AI. Each person gets a color. While they type you see that color on their cursor. After they leave a line, the color stays in the left margin with their name, so you can see who wrote it.

GitHub Pages has no build step, so the web config has to live in `config.js`. Those four values are the public client config. They are not a private key. Do not download a service account, and do not commit one.

1. Open [Firebase console](https://console.firebase.google.com/) and create a project. Stay on the **Spark** plan. You can turn Google Analytics off.
2. Project settings (the gear) → General → Your apps → **Add app** → Web (`</>`). Name it Doxa. Skip Firebase Hosting. Copy `apiKey`, `authDomain`, `projectId`, and `appId`.
3. Paste those four into `config.js` (see `config.example.js`). Commit `config.js`. Leave the file empty until then — the app still works on this device.
4. Build → **Authentication** → Get started → Sign-in method → **Email/Password** → Enable → Save. Leave phone sign-in off (that asks for the paid Blaze plan).
5. Build → **Firestore Database** → Create database → **production mode** → choose a region near the team → Enable.
6. Firestore → Rules → replace everything with the contents of `firestore.rules` → **Publish**.
7. Authentication → Settings → **Authorized domains** → Add `herbwriteswords.github.io`. Add a custom domain too if you use one. `localhost` is already allowed.
8. Merge to `main`. GitHub Pages serves `main`, so the hosted app updates after that merge, not when this branch is pushed.
9. On the site, tap **Account**, then **Create account** (name, email, password of at least 6 characters).
10. Open a song → **⋯** → **Share a copy**. The song on this device stays here. The shared copy is the one the team edits. Send the link, or the code. The other person creates an account and opens the link (or Account → Join with a code).

On a shared song the top bar says **Saving…** then **Saved**. Colors sit next to the names under the title. A name lights up while that person is in the song, and their cursor shows on the line they are editing. The margin keeps the color of whoever last edited the line.

Spark is sized for a small team (on the order of 50,000 reads and 20,000 writes a day, plus a daily cap on deletes). A rehearsal fits. You do not need to upgrade. If a screen asks for Blaze, skip it — Cloud Functions and phone auth are not used.

Shared songs need the network the first time. After that, the Firebase client keeps a copy on the phone and syncs when the connection comes back. Songs that were never shared never touch the network.

To click through the same screens on one computer before the Firebase project exists, open `index.html?demo=1` in two tabs (or run `DOXA_CLOUD.useDemo()` in the console of each). That preview stays in this browser. It is not the team's cloud.

## Add to Home Screen (iPhone)
Open the hosted URL in Safari, tap Share, then **Add to Home Screen**. After the first load it works offline.

## Files
`index.html`, `styles.css`, `app.js`, `collab.js`, `config.js`, `config.example.js`, `firestore.rules`, `sw.js` (offline cache `doxa-v1-3`; change the version on each deploy), `manifest.webmanifest`, `icons/`
- `data/rhymes.js`: about 16k words, rhyme keys from the CMU Pronouncing Dictionary (BSD), plus syllable counts
- `data/synonyms.js`: WordNet (Princeton license) plus hand-written worship synonyms
- `data/worship.js`: worship vocabulary, themes, and singable lines used for hints

Run it locally: `python3 -m http.server` in this folder.
