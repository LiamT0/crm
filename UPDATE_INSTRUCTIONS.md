# ForgeOS CRM — Lead Map + Neon DB (Update)

This update makes **“Save to Companies”** work from the Lead Map.

## What you get

- Clicking a pin (or a row) → **Save to Companies** → writes that business into **Neon** via **Netlify Functions**.
- Changing Lead Status (New / Called / Follow Up / Do Not Call / Won / Lost) auto-syncs back to the stored Company.

## 1) Add Neon tables

Run `neon_schema.sql` in your Neon SQL Editor.

## 2) Add Netlify env var

In Netlify project settings → Environment variables:

- `DATABASE_URL` = your Neon connection string

## 3) Deploy

Commit/push these files to the same repo you're deploying on Netlify.
Netlify will auto-install `package.json` deps and deploy the functions.

## 4) Use it

Open your CRM → Leads map tab.

- If you're on Netlify **and** the CRM is served from the same Netlify site, you **do not need** an API base URL.
- If you still want to use a custom base URL, set it in the Lead Map settings.

When you click **Save to Companies**, it stores in Neon and stamps the lead with a `company_id` (local).

## Notes

- This is a minimal backend. Next step is adding a real **Companies** tab that reads from Neon and drives the map.
