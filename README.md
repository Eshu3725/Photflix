# Photflix

Turn a photo album into a film, and browse your albums like a private streaming library.

Pick an album and Photflix cuts a film from it: an auto-designed poster, a title, tagline and genre, chapters by day,
slow cinematic camera moves with cross-dissolves, opening titles and end credits.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` type-checks and produces a production build in `dist/`; `npm run preview` serves it.

## Where photos come from

| Source | How it works |
| --- | --- |
| **Folder on this device** | Choose a folder (or drag one in). Every sub-folder that contains photos is offered as an album; tick the ones you want. |
| **Individual photos** | Hand-pick files for a single film. |
| **Google Photos** | Uses Google's Photos Picker. Needs a one-time OAuth client ID (below). |
| **Sample library** | Three generated albums, for trying the app with no photos. |

Photos are resized to 1080p-class JPEGs and stored in the browser's IndexedDB. Nothing is uploaded anywhere; the
library lives in the browser profile you imported it in. Albums over 300 items are sampled evenly.

### Google Photos setup

Google no longer lets third-party apps list a user's library or albums. The supported route is the Picker: Google shows
its own selection screen (where you can browse your albums) and hands the app only what you choose.

1. In Google Cloud Console, enable the **Photos Picker API**.
2. Create an **OAuth client ID** of type *Web application*.
3. Add `http://localhost:5173` as an authorised JavaScript origin.
4. Paste the client ID into the app when asked, or put it in `.env` as `VITE_GOOGLE_CLIENT_ID` (see `.env.example`).

Downloads of picked photos fall back to a small proxy built into the Vite dev/preview server (`vite.config.ts`) when the
browser blocks a direct read. If you host the built app on a static host, you need an equivalent `/api/gphoto` endpoint.

## Player controls

`Space` play/pause · `←` `→` previous/next scene · `F` fullscreen · `M` mute · `Esc` back.
Click the timeline to jump; chapter breaks are marked on it. Add a soundtrack per film from **Edit** on its details page.

## Layout

- `src/lib` — storage (`db.ts`), import pipeline (`importer.ts`), poster rendering (`poster.ts`), Google Photos
  (`googlePhotos.ts`), chapters and timing (`scenes.ts`)
- `src/state/library.tsx` — the album library shared by all screens
- `src/components` — home, hover preview, film details, import flow, player
