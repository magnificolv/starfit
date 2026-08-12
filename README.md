# StarFit ⭐ — Workout Log

Modern, dark-by-default workout tracker — FitNotes spirit, Mans Dizains / Starlight visual DNA.
Local-first PWA: dati paliek **tikai tavā ierīcē** (localStorage). Bez reklāmām, bez mākoņa, bez kontiem.

**Live:** pēc GitHub Pages ieslēgšanas → `https://magnificolv.github.io/starfit/`

## Features
- 📋 **Daily log** — seti (svars × atkārtojumi), dienu pārslēgšana, *Start New* / *Copy Previous*
- 📅 **Kalendārs** — krāsaini punkti pa muskuļu grupām
- 💪 **Vingrinājumi** — kategorijas, meklēšana, pašu pievienošana
- ⏱ **Rest timer**
- 📈 **Grafiki** — Estimated 1RM, Max Weight, Volume, Max Reps
- 🗂 **Backup** — JSON + CSV (FitNotes-compatible columns)
- ⬆ **FitNotes CSV imports** — pārnes 400+ treniņus no FitNotes export

## Migrācija no FitNotes
1. FitNotes app → **Settings → Export → CSV** → saglabā `FitNotes_Export.csv`
2. Atver StarFit → ⚙ Iestatījumi → **Importēt FitNotes CSV**
3. Izvēlies failu → **Apvienot** (vai Aizstāt)
4. Gatavs — kalendārā redzēsi visas dienas

> Importētie dati **netiek** sūtīti uz serveri un **nav** GitHub repo — tikai tavā pārlūkā / telefona localStorage.

## Palaist lokāli
```bash
cd starfit
python3 -m http.server 8080
# http://localhost:8080
```

## Publish (GitHub Pages)
Repo jau: `magnificolv/starfit`

GitHub → **Settings → Pages** → Source: **Deploy from a branch** → `main` / **/(root)** → Save

Pēc ~1 min: https://magnificolv.github.io/starfit/

Instalē kā app: Chrome/Android → **Add to Home screen**.

## Tech
Vanilla HTML/CSS/JS, PWA service worker, localStorage. Nav build step.

Version: **1.1.0**
