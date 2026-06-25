# AIP Investment Dashboard Setup Guide

This guide explains how to get the dashboard from GitHub, run it on your own computer, capture Amazon products, and upload weekly earnings CSVs.

The dashboard is local-first when you are signed out. Signed-out data stays in your own browser on your own computer. If you sign in and use the Chrome extension, your products and dashboard data save to your signed-in Supabase cloud account so they can sync across browsers.

## Quick Overview

Use this order:

1. Download the dashboard from GitHub.
2. Start it with the launcher for your computer.
3. Open `http://127.0.0.1:4173/`.
4. Set up the Amazon Chrome extension one time.
5. Add products before uploading earnings CSVs.
6. Upload weekly CSVs and map income to `Commission earned`.
7. Review suggested matches.
8. Check payback and ROI.
9. Export backups regularly.

## 1. Get the Dashboard From GitHub

You can get the dashboard two ways.

### Option A: Download ZIP

1. Open the GitHub page for the dashboard.
2. Click the green `Code` button.
3. Click `Download ZIP`.
4. Unzip the downloaded file.
5. Move the unzipped folder somewhere easy to find, like your Desktop.
6. Open the dashboard folder.

### Option B: Clone With Git

If you use Git, open PowerShell and run:

```powershell
git clone https://github.com/Noah-your-go-to-guy/AIP-investment-dashboard-tracker.git
cd AIP-investment-dashboard-tracker
```

## 2. Check the Folder

The dashboard folder should include files like:

- `index.html`
- `app.js`
- `styles.css`
- `server.js`
- `start-dashboard.cmd`
- `README.md`
- `HOW_TO_SETUP.md`

There is no dependency install step. You do not need to run `npm install`.

## 3. Start the Dashboard

You need Node.js installed first. You do not need to install any dashboard dependencies.

### Windows

The easiest way on Windows is to double-click:

```text
start-dashboard.cmd
```

Or run this in PowerShell:

```powershell
node server.js
```

### Mac

The easiest way on Mac is to double-click:

```text
start-dashboard.command
```

The first time you use it, your Mac may block it because it was downloaded from the internet. If that happens:

1. Right-click `start-dashboard.command`.
2. Click `Open`.
3. Click `Open` again if your Mac asks for confirmation.

If double-clicking still does not work, open Terminal in the dashboard folder and run:

```bash
chmod +x start-dashboard.command
./start-dashboard.command
```

You can also run the dashboard manually from Terminal:

```bash
node server.js
```

Then open this address in your browser:

```text
http://127.0.0.1:4173/
```

Important: use the `http://127.0.0.1:4173/` version, not the `file:///.../index.html` version.

The `http://127.0.0.1:4173/` address is still only running on your computer. It is not public. It just gives the browser a normal local web app address so imports, backups, and storage behave more reliably.

## 4. Set Up the Amazon Chrome Extension

This is the recommended capture tool. You only do this once.

The extension saves to your signed-in cloud account in Supabase. Sign in or create an account in the dashboard first. For local-only use, use the bookmarklet fallback.

Fastest friends-only setup: click `Download Windows setup helper` or `Download Mac setup helper` in the dashboard `Setup` tab. The setup helper downloads the verified extension package, prepares it in your Documents folder, copies the extension folder path, and opens Chrome extensions. You still need to turn on Developer mode, click `Load unpacked`, and choose the copied folder path.

Mac note: if double-clicking the helper does not open, open Terminal and run `bash ~/Downloads/install-aip-extension-mac.command`.

If you do not already have the extension files on your computer, click `Download Chrome extension ZIP` in the dashboard `Setup` tab. Unzip the download before loading it in Chrome.

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Choose the unzipped extension folder named `extension`.
6. Open Chrome's extensions menu.
7. Pin `AIP Portfolio Capture`.

When you buy an Amazon product for the dashboard:

1. Open the Amazon product page.
2. Click the pinned `AIP Portfolio Capture` extension.
3. Review the title, ASIN, brand, category, Amazon price, and link.
4. Edit the purchase date or purchase price if needed.
5. Click `Save as bought`.

## 4B. Set Up the Amazon Bookmarklet Fallback

You only do this once. Do not make a new bookmark for every product.

1. Open the dashboard.
2. Click the `Setup` tab.
3. Click `Copy bookmarklet`.
4. Show your browser bookmarks bar with `Ctrl + Shift + B`.
5. Right-click the bookmarks bar.
6. Choose `Add page` or `Add bookmark`.
7. Name the bookmark `Send to AIP Dashboard`.
8. Paste the copied bookmarklet into the bookmark URL field.
9. Save the bookmark.

You can now reuse this same bookmark for every Amazon product page.

## 5. Add Products Before Uploading Earnings CSVs

Important: add the product to the dashboard before uploading earnings CSVs.

If the product is not in the dashboard first, imported earnings may stay unmatched or go to review instead of counting toward that product.

## 6. Add a Product With the Bookmarklet Fallback

Skip this section if you are using the Chrome extension. The extension saves the product directly as `bought` after you sign in, review the Amazon price, and choose the purchase date.

Use these steps only if you want local-only capture or if the Chrome extension is not working for that product page.

1. Open the Amazon product page.
2. Click your `Send to AIP Dashboard` bookmark.
3. The bookmarklet will copy product JSON or download a small JSON file.
4. Go back to the dashboard.
5. Click `Products`.
6. Click `Add product`.
7. Paste the captured JSON into `Paste captured Amazon JSON here`.
8. Click `Import pasted capture`.
9. Click `Apply autofill`.
10. Review the product details.
11. Add your real cost details: purchase price, tax, shipping, discounts, and refunds/returns.
12. Set the product status.
13. Click `Save product`.

## 7. Track Videos

Inside a product, use the `Videos` section to add each video separately.

For each video, add:

- Video title or name
- Video link
- Posted date
- Notes

## 8. Upload Weekly Earnings CSVs

After your products are in the dashboard, you can upload earnings CSVs.

1. Click `CSV Import`.
2. Choose your weekly earnings CSV.
3. Confirm the column mapping.
4. Make sure the money column maps to `Commission earned`.
5. Import the rows.

The dashboard stacks weekly earnings over time.

Example:

- Week 1 product earnings: `$15`
- Week 2 product earnings: `$20`
- Lifetime product earnings: `$35`

## 9. Review Matches

Some imported rows may not match perfectly.

Exact ASIN matches count automatically.

Title-based or fuzzy matches go to `Match Review`.

In `Match Review`, approve only the matches you trust. Approved matches will count automatically in future CSV uploads.

## 10. Check Payback

In the Products table, each product has a payback bar.

The payback bar shows how much of your product cost has been recovered through Amazon commission and any net resale proceeds you record.

Use `Mark as resold` in the product form if you sell the physical product. Enter the cash you kept after selling fees and shipping. Amazon commission remains visible separately from resale proceeds.

## 11. Avoid Duplicate CSV Income

The dashboard protects against duplicate imported earnings rows.

It checks:

```text
report date + ASIN + title + commission amount
```

If you accidentally upload the same weekly CSV twice, duplicate rows should be skipped.

## 12. Back Up Your Data

The dashboard stores data locally in your browser.

Use `Export backup` regularly.

Save the backup somewhere safe, especially before:

- Clearing browser data
- Moving computers
- Making big changes

## Simple Weekly Workflow

Most weeks, the process should be:

1. Add any new products you bought.
2. Add video links or posted dates for products you filmed.
3. Upload the newest earnings CSV.
4. Review any suggested matches.
5. Check payback and ROI.
6. Export a backup.
