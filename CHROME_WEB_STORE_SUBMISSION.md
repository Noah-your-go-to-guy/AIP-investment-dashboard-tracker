# Chrome Web Store Submission Guide

Use this when you are ready to publish the AIP Portfolio Capture extension on the Chrome Web Store.

## What We Already Prepared

- Extension name: `AIP Portfolio Capture`
- Upload package: `store-packages/aip-portfolio-capture-0.1.0.zip`
- Privacy policy URL after the next Vercel deploy: `https://aip-investment-dashboard-tracker.vercel.app/privacy.html`
- Local unpacked extension folder for testing: `extension`

Important: the Chrome Web Store package is different from the dashboard download ZIP. The store package has `manifest.json` at the ZIP root, which is what the Chrome Web Store Developer Dashboard expects.

## Before You Upload

1. Open the Chrome Web Store Developer Dashboard.
2. Register as a Chrome Web Store developer if you have not already.
3. Agree to Google's developer agreement and pay the one-time registration fee if Google prompts for it.
4. Make sure the live dashboard URL works: `https://aip-investment-dashboard-tracker.vercel.app`
5. Make sure the privacy policy URL works: `https://aip-investment-dashboard-tracker.vercel.app/privacy.html`

## Upload Package

1. In the Chrome Web Store Developer Dashboard, click `Add new item`.
2. Upload `store-packages/aip-portfolio-capture-0.1.0.zip`.
3. If Chrome accepts the package, continue filling out the listing.

## Store Listing Copy

### Name

AIP Portfolio Capture

### Short Description

Save Amazon product details directly to your AIP Portfolio dashboard.

### Detailed Description

AIP Portfolio Capture helps Amazon Influencer Program creators save product investment details with fewer clicks.

Open an Amazon product page, click the extension, review the detected product details, then save the item as bought in your AIP Portfolio dashboard. The extension captures the product title, ASIN, brand, category, Amazon link, visible Amazon price, purchase price, and purchase date so you can track product investment recovery over time.

This extension is built for creators using the AIP Portfolio dashboard. It does not automate Amazon earnings downloads, place orders, scrape private account pages, or make buying decisions. It only saves product capture details you review and approve.

### Category

Productivity

### Homepage URL

https://aip-investment-dashboard-tracker.vercel.app

### Support URL

https://github.com/Noah-your-go-to-guy/AIP-investment-dashboard-tracker/issues

## Privacy Fields

### Single Purpose

Save Amazon product page details into the user's AIP Portfolio dashboard so creators can track product investment costs, resale recovery, and commission payback.

### Permission Justifications

- `storage`: Keeps temporary extension state such as signed-in session details needed to save to the dashboard.
- `https://*.amazon.com/*`: Allows the extension to read product details from the Amazon product page the user is viewing.
- `https://gvifstpfolidkvxjeftx.supabase.co/*`: Allows the extension to save reviewed product records to the user's AIP Portfolio cloud account.

### Remote Code

No. The extension does not execute remote code.

### Data Use

The extension may collect product information the user chooses to save, including product title, ASIN, brand, category, Amazon link, price, purchase date, and purchase price. When the user is signed in, that data is saved to the AIP Portfolio Supabase cloud database for that user.

The extension does not sell user data, does not use data for ads, and does not transfer data except to provide the dashboard storage feature.

### Privacy Policy URL

https://aip-investment-dashboard-tracker.vercel.app/privacy.html

## Test Instructions

Use these instructions if Chrome asks how reviewers should test it:

1. Go to `https://aip-investment-dashboard-tracker.vercel.app`.
2. Create an account or sign in.
3. Open any Amazon product page.
4. Click the AIP Portfolio Capture extension.
5. Confirm that the overlay reads product details from the page.
6. Enter or confirm the purchase price and purchase date.
7. Click `Save as bought`.
8. Return to the dashboard and confirm the product appears in the Products tab.

If reviewer credentials are needed, create a temporary dashboard account before submitting and enter those credentials in the private test instructions field.

## Store Assets Still Needed

Chrome may ask for:

- A 128x128 icon. We already have `extension/icons/icon128.png`.
- At least one 1280x800 screenshot.
- A 440x280 small promo tile.
- An optional 1400x560 marquee promo tile.
- Optional YouTube demo video.

Best screenshot idea: show an Amazon product page with the AIP Portfolio Capture overlay open, then another screenshot of the saved product in the dashboard.

## Submit

1. Finish the Store Listing tab.
2. Finish the Privacy tab.
3. Finish the Distribution tab.
4. Add test instructions if requested.
5. Click `Submit for Review`.

Choose deferred publishing if you want to manually publish after Google's review passes.
