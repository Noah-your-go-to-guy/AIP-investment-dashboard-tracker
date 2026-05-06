# Agent Context

## Project
- This is a local browser-based Amazon Influencer Program investment dashboard.
- The app tracks products bought specifically for making influencer videos and measuring whether those purchases paid off.
- The user prefers a non-technical, practical workflow and wants the app to feel like a clean finance dashboard rather than a marketing page.

## Current Implementation
- The app is intentionally dependency-light: static `index.html`, `styles.css`, `app.js`, plus `server.js` for local serving.
- Tesseract.js is now installed as a local npm dependency for screenshot OCR.
- Data is stored locally in the browser with IndexedDB.
- Run from this folder with `node server.js`, then open `http://127.0.0.1:4173/`.
- There is no git repository initialized in this folder at the time of writing.

## Core Product Decisions
- One investment record equals one bought product.
- ROI is product-level, not video-level, because Amazon does not provide revenue attribution by individual video.
- ROI uses net profit: commissions/revenue minus full landed cost.
- Imported ROI income should mean commission earned only, not shipped revenue/sales volume.
- Full landed cost includes purchase price, tax, shipping, discounts, and refunds/returns.
- The buy-to-profit lifecycle is: researched, bought, received, filmed, posted, earning, paid off, retired.
- The first screen should be an ROI command center with totals, payback, monthly trend, top winners, and laggards.
- Purchased-products view/filter means statuses `bought`, `received`, `filmed`, `posted`, `earning`, and `paid off`.
- Storefront/video tracking is manual in v1. Do not attempt automatic storefront scraping until the user explicitly asks for a helper/import workflow.

## Main Features
- Manual product entry.
- Manual revenue entry.
- CSV import wizard with column mapping.
- Weekly CSV imports should stack into lifetime product earnings, while duplicate rows are skipped using `report date + ASIN + title + commission amount`.
- Revenue matching by exact ASIN when possible.
- Fuzzy match suggestions by title/brand/variation clues, but fuzzy matches must be approved before they affect ROI. Approved matches persist and should auto-count in future imports.
- Match review queue for approving or rejecting suggested listing/variation matches.
- Exports for products, revenue, ROI summary, and full JSON backup.
- Sample data button for quickly seeing dashboard behavior.
- Purchased-products filter, per-product payback bars, storefront links, manual video status, and repeatable video records are part of the product ledger.
- Video records include video title/name, video link, posted date, and notes.

## Hybrid Product Autofill
- The user cannot use Amazon Product Advertising API / Creators API credentials.
- Do not plan around paid/API-only lookup as the default.
- Current no-API autofill approach:
  - Paste raw ASIN or Amazon product link and extract ASIN.
  - Normalize Amazon link to `https://www.amazon.com/dp/{ASIN}`.
  - Use the Amazon page importer/bookmarklet as the preferred capture path.
  - The bookmarklet is generated in the dedicated `Setup` tab, runs on Amazon product pages, reads the DOM directly, then copies or downloads a JSON payload.
  - The dashboard can paste/upload that JSON and turn it into confidence-labeled autofill suggestions for ASIN, Amazon link, title, brand, category, and purchase price.
  - Upload saved Amazon product page HTML and parse visible title, brand, category breadcrumbs, price, and ASIN-like identifiers.
  - Upload product screenshot and run Tesseract.js OCR in the browser.
  - Search local imported CSV/raw rows and existing saved products for matching ASIN/title/brand details.
- Autofill suggestions must be confidence-labeled: exact, likely, weak, or manual.
- Autofill must not overwrite user-entered fields until the user clicks `Apply autofill`.
- Screenshot OCR uses the local Tesseract.js engine and downloads/caches English language data on first use.
- Screenshot OCR should now be treated as a fallback, not the main product-entry path. In testing, full-page Amazon screenshots produced noisy results because OCR cannot reliably distinguish product title/brand/price from sidebar text, buttons, ads, and promos.
- The implemented primary no-API autofill path is an Amazon page extractor/bookmarklet:
  - User opens an Amazon product page.
  - User clicks a saved browser bookmark/action such as `Send to AIP Dashboard`.
  - The script reads DOM fields directly from the product page, including title, byline/brand, price, breadcrumbs/category, ASIN, canonical link, and possibly image URL.
  - The script copies or downloads a small JSON payload.
  - The dashboard imports/applies that JSON with confidence labels.
- Saved HTML upload should remain the second-best reliable method and should be improved before investing more in screenshot OCR.
- Screenshot OCR should remain available only as a rough fallback, ideally with guidance to upload cropped screenshots focused on the title/price/byline area.

## Design Constraints
- Keep the top layout stable: hero/header, backup/sample action row, and sticky tabs must not overlap.
- Avoid giant marketing-style cards or landing-page content; the app should open directly to the usable dashboard.
- Use compact, scannable finance-dashboard styling.
- Preserve responsive behavior across desktop, tablet, and mobile.
- Avoid corrupted/non-ASCII UI symbols unless there is a clear need; simple ASCII labels are acceptable.
- The latest redesign direction is a more premium local portfolio/workspace feel: compact dark header, neutral off-white workspace, crisp metric cards with colored left indicators, stronger product table hierarchy, better empty states, and a more organized Add Product dialog.

## Important Files
- `index.html`: app structure, tabs, dialogs, product helper UI.
- `styles.css`: finance-style dashboard layout and responsive UI.
- `app.js`: IndexedDB data layer, rendering, product/revenue forms, CSV import, matching, exports, and autofill parsing.
- `server.js`: tiny local static server.
- `README.md`: run instructions and local data note.

## Verification Already Done
- `node --check app.js` passed after the redesign/autofill update.
- `node --check server.js` passed.
- A local server smoke check returned 200 for `/`, `/styles.css`, and `/app.js`.
- A JS-to-HTML ID consistency check found no missing static element references.

## Future Work Ideas
- Create a non-technical how-to setup document later, once the dashboard is more settled. It should explain how to run the local dashboard, install/use the `Send to AIP Dashboard` bookmarklet, import Amazon product captures, back up data, and share the dashboard method with other users.
- The how-to doc must clearly explain the correct workflow order: add/capture the investment product before uploading earnings CSVs. If the product is not in the dashboard first, imported income may stay unmatched or require review instead of counting toward that product's earnings.
- Add a one-click local receiver endpoint later if browser security allows a smooth localhost handoff; clipboard/download JSON is the reliable current method.
- Improve saved Amazon HTML parsing for title, byline/brand, price, breadcrumbs/category, ASIN, and image URL.
- Keep screenshot OCR as fallback only; consider crop-zone UI if OCR remains useful later.
- Add a product image field and render thumbnails in the product table.
- Add better monthly import reconciliation if Amazon reporting formats become consistent.
- Add duplicate product warnings when a new ASIN/title is already tracked.
- Add backup reminder or automatic export prompt before clearing data.
