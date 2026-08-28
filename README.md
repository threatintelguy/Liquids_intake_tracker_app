# Intake

A fluid and symptom log for a phone. Tap the container you drank from, and the day's
totals, charts and cramping comparisons build themselves.

**Your log never leaves your phone.** See [Where the data lives](#where-the-data-lives).

## Put it online

GitHub Pages serves public repositories on a free personal account. Private
repositories need GitHub Pro or higher, and even then the *published site* is still
public — repository visibility and site visibility are separate settings.

**If the repo is public:** Settings → Pages → *Build and deployment* →
Source: **Deploy from a branch**, Branch: **main**, Folder: **/ (root)** → Save.
Give it a minute, then open the URL it shows.

**If the repo is private and you want it to stay that way:** deploy through
Cloudflare Pages instead. Connect your GitHub account, pick this repo, leave the build
command empty and the output directory as `/`. It serves the files as they are.

Either way, the app itself is identical and your log stays on your phone.

### Make it feel like an app

- **iPhone:** open the page in Safari, tap Share, then *Add to Home Screen*.
- **Android:** open in Chrome, tap the menu, then *Add to Home screen* / *Install app*.

It launches full screen with no address bar, and works without a signal once loaded.

### Bringing your log in

The app ships empty. That's deliberate — this repo is the public half of the project,
and what you drank and how you felt isn't public information. Two ways to load history,
both under **Settings** on the phone:

**Import a spreadsheet (CSV).** Reads the one-row-per-day layout: Date, Water,
Electrolytes, Caffeine + type + finish time, Alcohol + type + time, Other liquids +
types, Creatine, Symptoms, Cramping, Workout, Exertion. Headings are matched by name,
so column order doesn't matter and extra columns are ignored. Pick a `.csv` file, or
just copy the rows out of Excel or Sheets and paste them in — pasted spreadsheet rows
arrive tab-separated and are handled too.

Details it handles: dates as `8-21-26`, `08/21/2026` or `2026-08-21`; times as
`9:00 AM` or `21:15`, with `NA` and blanks meaning none; several drinks in one cell,
so `12; 6` against `beer; mojito` becomes two drinks; one caffeine total split across
`tea black; tea green`; cramping written as `Slight cramping` or
`Slight, left calf overnight`, where the detail is kept as a note. Nothing is written
until you've seen the preview, which lists every day it found and flags any that would
overwrite something already in your log.

Because a daily total doesn't say *when* you drank it, imported ounces are spread over
plausible hours — water across the day, electrolytes mid-morning to late afternoon,
caffeine backwards from the finish time you gave, other liquids in the evening. Daily
totals and every chart built on them are exact; the clock timeline for imported days is
an approximation. Days you log by tapping carry real timestamps.

**Restore from a backup file.** The `.json` this app writes under *Save a backup file*.
That one round-trips exactly, timestamps and all. Keep it somewhere private; don't
commit it here.

## Where the data lives

Everything you log is written to your browser's `localStorage`, which is storage
attached to one site, in one browser, on one device. Specifically:

- **Nothing is uploaded.** GitHub Pages serves static files. There is no server,
  database or API behind this app to receive anything, so there is nowhere for your
  log to go even in principle.
- **Other visitors see an empty app.** `localStorage` is scoped per device and per
  browser. Someone opening the same URL gets the seeded example week and their own
  private storage. They cannot read yours, and you cannot read theirs.
- **The code and the data are separate.** Whether this repo is public or private
  changes who can read the source. It has no bearing on your log, which was never in
  the repo to begin with. Keep it that way: don't commit a backup `.json`.

Two things worth knowing:

- Anyone with unlocked access to *your* phone's browser can open the page and see your
  log. It isn't encrypted or behind a password.
- Clearing your browser's site data, or deleting the app data on iOS, erases the log.
  Use **Settings → Save a backup file** now and then, and *Restore from a backup file*
  to bring it back or move it to a new phone.

Private browsing blocks storage entirely. The app notices, keeps working for the
session, and says so in Settings.

## Editing the app

The source is `src/app.jsx` (all of it — one file) and `src/main.jsx` (four lines that
mount it). `app.js` is the built bundle that the page actually loads, so after any
edit you need to rebuild:

```bash
npm install
npm run build      # rewrites app.js
```

`npm run dev` serves the folder at http://localhost:8000 and rebuilds as you type.

Commit the updated `app.js` along with your source change — GitHub Pages serves files
as they are and doesn't build anything for you.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page shell |
| `app.js` | The built app — React, Recharts and the source, bundled |
| `src/app.jsx` | The actual source |
| `src/main.jsx` | Mounts the app, registers the service worker |
| `sw.js` | Offline support. Network first, so a new deploy always wins |
| `manifest.webmanifest` | Name, colors and icons for home-screen install |

If a phone ever holds onto an old version, bump `CACHE = "intake-v1"` in `sw.js` to
`intake-v2` and redeploy.
