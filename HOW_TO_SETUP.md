# AIP Investment Dashboard Setup Guide

This guide explains how to install the dashboard from GitHub, run it on your own computer, and start tracking Amazon Influencer product investments.

## 1. Get the Dashboard From GitHub

You can install it two ways.

### Option A: Download ZIP

1. Open the GitHub page for the dashboard.
2. Click the green `Code` button.
3. Click `Download ZIP`.
4. Unzip the downloaded file.
5. Move the unzipped folder somewhere easy to find, like your Desktop.

### Option B: Clone With Git

If you use Git, open PowerShell and run:

```powershell
git clone YOUR_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace `YOUR_REPOSITORY_URL` with the GitHub link for the dashboard.

## 2. Check the Folder

The dashboard folder should include files like:

- `index.html`
- `app.js`
- `styles.css`
- `server.js`
- `start-dashboard.cmd`
- `README.md`
- `HOW_TO_SETUP.md`

There is no dependency install step.

## 3. Start the Dashboard

The easiest way on Windows is to double-click:

```text
start-dashboard.cmd
```

Or run this in PowerShell:

```powershell
node server.js
```

Then open this address in your browser:

```text
http://127.0.0.1:4173/
```

Important: use the `http://127.0.0.1:4173/` version, not the `file:///.../index.html` version.

## 4. Set Up the Amazon Bookmarklet

You only do this once.

1. Open the dashboard.
2. Click the `Setup` tab.
3. Click `Copy bookmarklet`.
4. Show your browser bookmarks bar with `Ctrl + Shift + B`.
5. Right-click the bookmarks bar.
6. Choose `Add page` or `Add bookmark`.
7. Name the bookmark:

```text
Send to AIP Dashboard
```

8. Paste the copied bookmarklet into the bookmark URL field.
9. Save the bookmark.

You can now reuse this same bookmark for every Amazon product page.

## 5. Add Products Before Uploading Earnings CSVs

Important: add the product to the dashboard before uploading earnings CSVs.

If the product is not in the dashboard first, imported earnings may stay unmatched or go to review instead of counting toward that product.

## 6. Add a Product From Amazon

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
11. Add your real cost details:
    - Purchase price
    - Tax
    - Shipping
    - Discounts
    - Refunds/returns
12. Set the product status.
13. Click `Save product`.

## 7. Track Videos

Inside a product, use the `Videos` section to add each video.

For each video, add:

- Video title/name
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

The payback bar shows how much of your product cost has been earned back through commissions.

The dashboard uses commission earned only for ROI.

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

## Simple Workflow

Use this order:

1. Install from GitHub.
2. Start dashboard.
3. Set up bookmarklet once.
4. Add product from Amazon.
5. Save product cost details.
6. Add videos as you make them.
7. Upload weekly earnings CSVs.
8. Review suggested matches.
9. Check payback and ROI.
10. Export backup.
