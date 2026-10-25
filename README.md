# Doxa
*δόξα — glory, praise.* A worship songwriting web app. No AI: rhymes, synonyms and line hints all come from data bundled in the app, so it works offline.

## Use it
- **Songs list:** tap **＋ New song**. Use ⋯ on a song to rename, duplicate or delete it.
- **Sections:** tap a section chip (VERSE 1, CHORUS…) to change its type. Use ↑ ↓ to reorder and ⋯ to duplicate or delete. The buttons under the song add sections.
- **Bold:** select some text, then tap **B**.
- **Word help:** select a word and pick **Rhyme**, **Synonym** or **Worship words** from the menu. A sheet slides up from the bottom.
  - **Rhyme** adds the word you tap to the end of the *next* line. If there isn't one, it starts a new line.
  - **Synonym** and **Worship words** replace the word you selected.
- **Hints** (off by default): after you finish a line, 2–3 line ideas appear. They're built from rhymes, words already in your song, and worship phrase templates. Tap one to add it, or ✕ to hide them.
- Everything is saved on the device (localStorage, key `doxa-v1`). Dark mode follows the system setting.

## Add to Home Screen (iPhone)
Open the hosted URL in Safari, tap Share, then **Add to Home Screen**. After the first load it works offline.

## Files
`index.html`, `styles.css`, `app.js`, `sw.js` (offline cache `doxa-v1-0`; change the version on each deploy), `manifest.webmanifest`, `icons/`
- `data/rhymes.js`: about 16k words, rhyme keys from the CMU Pronouncing Dictionary (BSD), plus syllable counts
- `data/synonyms.js`: WordNet (Princeton license) plus hand-written worship synonyms
- `data/worship.js`: worship vocabulary, themes and hint templates

Run it locally: `python3 -m http.server` in this folder.
