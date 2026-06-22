# GayXXX SkyStream repository

This repository is structured as a SkyStream Gen 2 plugin repository.

## Active plugins

- `gxtapes` / `G_Xtapes`
- `nurgay` / `Nurgay`

`Pornhoarder` was moved to `_disabled/pornhoarder` because it still contained only the default generated template and had no real provider/source code.

## Repository URL

Use this in SkyStream after pushing to the `skystream` branch:

```text
https://raw.githubusercontent.com/donatelloroberto/gayvn-cs/skystream/repo.json
```

## Build

```powershell
npm install
skystream deploy -u https://raw.githubusercontent.com/donatelloroberto/gayvn-cs/skystream/
```

## Test examples

```powershell
skystream test -p gxtapes -f getHome
skystream test -p gxtapes -f search -q "twink"
skystream test -p gxtapes -f loadStreams -q "PASTE_GXTAPES_VIDEO_URL"

skystream test -p nurgay -f getHome
skystream test -p nurgay -f search -q "twink"
skystream test -p nurgay -f loadStreams -q "PASTE_NURGAY_VIDEO_URL"
```

## Notes

- `repo.json` now points to `dist/plugins.json` on the `skystream` branch.
- The active plugin files use `manifest.baseUrl` through helper functions.
- URL resolution was fixed to use `new URL(relative, base)` instead of unsafe string concatenation.
