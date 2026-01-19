# CRM (with Lead Map)

This is a static CRM that runs in the browser (GitHub Pages friendly) and includes a **Generate Leads** map.

## What works without any backend
- Dashboard / Contacts / Deals / Tasks / Planner
- Import/export contacts
- Lead list **storage** (localStorage) + CSV import/export

## What needs a backend (recommended)
The **Generate Leads** search needs an API key to query Google Places, and that key must **not** live in the browser. This repo includes a Netlify Function:

- `/.netlify/functions/places` (implemented in `netlify/functions/places.js`)

## Deploy the Lead Search backend (Netlify)
1. Create a free Netlify account.
2. "Add new site" → "Import an existing project" → connect this GitHub repo.
3. In Netlify → Site settings → **Environment variables**, add:
   - `GOOGLE_PLACES_API_KEY` = your Google Maps Platform key (Places API + Geocoding enabled)
   - Optional: `GOOGLE_PLACES_DETAILS_LIMIT` = `10` (default)
4. Deploy.

Netlify will give you a URL like:
- `https://YOUR-SITE.netlify.app`

## Connect the CRM (on GitHub Pages) to your backend
1. Open your CRM GitHub Pages site.
2. Go to **Generate Leads**.
3. Paste your Netlify site URL into **API Base URL** and click **Save API URL**.
4. Enter a keyword + location + radius and click **Search & Add Leads**.

## Notes
- Leads are saved locally in your browser. To persist across devices later, we can add Supabase/Firebase.
- You should still honor do-not-call rules and comply with spam/cold outreach laws for your region.
