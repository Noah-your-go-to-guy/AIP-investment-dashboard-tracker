# AIP Investment Dashboard

A local browser app for tracking Amazon Influencer Program investment products, product-level commissions, ROI, CSV imports, approved listing matches, video links, payback progress, and exports.

Your data stays on your own computer in your browser.

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

## Install Dependencies

Run this once inside the dashboard folder:

```powershell
npm.cmd install --cache .\.npm-cache --ignore-scripts
```

This installs the local files needed by the dashboard.

Do not upload or commit `node_modules`, `.npm-cache`, or `tessdata` to GitHub.

## Start the Dashboard

On Windows, double-click:

```text
start-dashboard.cmd
```

Or run:

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

The dashboard stores data locally in the browser using IndexedDB.

Use `Export backup` before clearing browser data, moving computers, or making major changes.

Backups and exported CSVs are ignored by Git by default so private data is not accidentally uploaded.

## More Help

See:

[HOW_TO_SETUP.md](./HOW_TO_SETUP.md)
