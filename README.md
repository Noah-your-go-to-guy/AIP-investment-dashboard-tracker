# AIP Investment Dashboard

An Amazon Influencer Program dashboard for tracking product investments, product-level commissions, ROI, CSV imports, approved listing matches, video links, payback progress, and exports.

The app can run locally or on Vercel. Signed-out users store data in their own browser. Signed-in users can store dashboard records in Supabase.

## Install From GitHub

### Option 1: Download ZIP

1. Open the GitHub repository page.
2. Click `Code`.
3. Click `Download ZIP`.
4. Unzip the folder somewhere easy to find, like your Desktop.
5. Open the unzipped folder.

### Option 2: Clone With Git

```powershell
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace `YOUR_REPOSITORY_URL` with the GitHub link for this project.

## Start the Dashboard

Install Node.js first if your computer does not already have it.

No dashboard dependency install is needed.

On Windows, double-click:

```text
start-dashboard.cmd
```

On Mac, double-click:

```text
start-dashboard.command
```

If Mac blocks the file the first time, right-click it, choose `Open`, then confirm. If needed, run this once in Terminal from the dashboard folder:

```bash
chmod +x start-dashboard.command
```

Or start it manually:

```powershell
node server.js
```

Then open:

```text
http://127.0.0.1:4173/
```

Use the `http://127.0.0.1:4173/` version, not `file:///.../index.html`.

## Setup Bookmarklet

Open the dashboard and click the `Setup` tab.

Use `Copy bookmarklet` to create a browser bookmark named:

```text
Send to AIP Dashboard
```

Paste the copied bookmarklet text into that bookmark's URL field.

You only set this up once. Then you reuse the same bookmark on any Amazon product page.

## Basic Workflow

1. Add/capture products first.
2. Save the real landed cost.
3. Add video links as you make videos.
4. Upload weekly Amazon earnings CSVs.
5. Review suggested matches.
6. Check payback and ROI.
7. Export backups regularly.

Important: add the product before uploading earnings CSVs. If the product is not in the dashboard first, imported earnings may stay unmatched or require review instead of counting toward that product.

## CSV Income Rules

CSV imports should map the income field to `Commission earned`.

Weekly CSV uploads stack into each product's lifetime earned total.

The dashboard skips duplicate imported revenue rows using this fingerprint:

```text
report date + ASIN + title + commission amount
```

Exact ASIN matches count automatically. Approved matches persist for future imports. Fuzzy title-based matches stay in Match Review until approved.

## Data And Backups

Signed-out users store data locally in the browser using IndexedDB.

Signed-in users store dashboard records in Supabase. Each user's records are protected by Supabase row-level security.

If you already have local browser data, sign in and click `Copy local data to cloud` to move those records into your Supabase account.

Supabase Auth must be configured to redirect back to the hosted dashboard. In Supabase, go to `Authentication` > `URL Configuration`, set the Site URL to the live Vercel URL, and add the hosted Vercel URL to Additional Redirect URLs.

Use `Export backup` before clearing browser data, moving computers, or making major changes.

Backups and exported CSVs are ignored by Git by default so private data is not accidentally uploaded.

## More Help

See:

[HOW_TO_SETUP.md](./HOW_TO_SETUP.md)

## Host On Vercel

This project can be hosted as a static Vercel site.

The hosted version can use Supabase accounts and cloud data storage. Users can still use local browser storage when signed out.

Recommended Vercel settings:

- Framework preset: `Other`
- Build command: leave empty
- Output directory: leave empty or use `.`
- Install command: leave empty

After deployment, open the Vercel URL and use the dashboard normally.
