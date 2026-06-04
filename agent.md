# Agent Context

## Project
- This is a local browser-based Amazon Influencer Program investment dashboard.
- The app tracks products bought specifically for making influencer videos and measuring whether those purchases paid off.
- The user prefers a non-technical, practical workflow and wants the app to feel like a clean finance dashboard rather than a marketing page.

## Current Implementation
- The app is dependency-free: static `index.html`, `styles.css`, `app.js`, plus `server.js` for local serving.
- There is no `npm install` dependency step anymore, but users still need Node.js installed so `server.js` and `start-dashboard.cmd` can run.
- Tesseract/screenshot OCR was removed because the Amazon bookmarklet capture workflow is more reliable and simpler for GitHub users.
- Signed-out data is stored locally in the browser with IndexedDB.
- Signed-in data is stored in Supabase using `public.dashboard_records`, a JSONB record table keyed by `user_id`, `store`, and `id`.
- Supabase RLS is enabled on `public.dashboard_records`; authenticated users can select/insert/update/delete only their own rows.
- The app uses the Supabase publishable key in `app.js`, which is acceptable client-side because RLS enforces user data isolation.
- Users can sign in/create an account from the dashboard header. When signed in, all existing app storage helpers read/write Supabase instead of IndexedDB.
- Sign-up passes `emailRedirectTo` based on the current site origin/path so confirmation emails return to the active dashboard URL. Supabase Auth URL Configuration still needs Site URL/Additional Redirect URLs set to the hosted Vercel URL.
- The cloud account UI includes a clear `Signed in`/`Local` pill and a `Resend confirmation` button using `supabase.auth.resend({ type: "signup" })`.
- `Copy local data to cloud` reads local IndexedDB records and upserts them into the signed-in Supabase account.
- Run from this folder with `node server.js`, then open `http://127.0.0.1:4173/`.
- On Windows, most users should start it by double-clicking `start-dashboard.cmd`, then opening `http://127.0.0.1:4173/`.
- `start-dashboard.cmd` should work for other Windows users after they download/unzip the repo, as long as Node.js is installed and available on PATH.
- Mac users can use `start-dashboard.command` or run `node server.js` from Terminal. If macOS blocks the downloaded launcher, right-click `start-dashboard.command`, choose `Open`, and confirm; if needed run `chmod +x start-dashboard.command` once.
- Linux users can run `node server.js` from Terminal unless a Linux launcher is added later.
- The project has been pushed to GitHub at `https://github.com/Noah-your-go-to-guy/AIP-investment-dashboard-tracker`.
- Latest pushed commit as of May 7, 2026: `66ad7ef Improve CSV revenue imports and match review`.
- Vercel and Supabase connectors are available in Codex as of June 4, 2026. Supabase has one active healthy project `gvifstpfolidkvxjeftx`; Vercel has team `Noah's projects` with ID `team_H5iCAXyorr8oK9VS9fJtQqac`.
- Hosted Vercel version now has Supabase auth/cloud storage wiring, while preserving local browser storage for signed-out use.

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
- Exact duplicate CSV files are blocked using a SHA-256 hash of the file text saved on the import batch.
- `Remove duplicate CSV rows` removes duplicate imported CSV revenue rows with the same revenue fingerprint while keeping products and the first copy of each row.
- CSV data clearing and duplicate cleanup use bulk deletion in cloud mode and show progress/status in the CSV import summary, instead of appearing stuck while Supabase deletes rows.
- CSV import disables the import button and shows status while saving. In cloud mode, imported revenue rows are batch-upserted to Supabase instead of saved one row per network request.
- CSV import now shows import history with file name, imported time, detected report date, mapped money column, rows found, rows imported, and duplicates skipped.
- CSV import supports comma-separated and tab-separated files, and the mapping preview explicitly shows only the first five rows even though all rows import.
- Creator Connections-style files should map income to `Total Earnings`, not `Commission Rate`, `Shipped Revenue`, or `Shipped Earnings`.
- CSV filenames such as `apr 1 to 7 CC earnings.csv`, `April 24 to may 1 CC earnings.csv`, and `earnings_report_2026-04-12_to_2026-04-19.csv` are used to infer a report date when the CSV has no date column.
- There is a `Clear CSV data (keep products)` action that removes imported CSV revenue, ignored CSV rows, match-review CSV rows, pending import UI, and import history without deleting products, videos, costs, manual revenue, or approved matches.
- Revenue matching by exact ASIN when possible.
- Revenue matching also auto-counts exact title matches even when the ASIN differs, because Amazon often reports variation ASINs under the same product title.
- Revenue matching repairs imported rows that share the same exact imported campaign/title text as another row already counted under one product. This catches Creator Connections campaign-code rows such as `P30S16` where several ASIN variants belong to the same campaign/product.
- On app load and after saving a product, existing unmatched/suggested revenue rows are repaired if their title exactly matches a saved product.
- Fuzzy match suggestions by title/brand/variation clues, but fuzzy matches must be approved before they affect ROI. Approved matches persist and should auto-count in future imports.
- Fuzzy scoring considers likely title brand tokens such as `Peakeep` or `SlowMag` when brand columns are missing.
- Match Review includes a searchable queue sorted by likeliest matches first; suggested and possible matches appear above truly unmatched rows.
- Match Review includes an `All imported revenue rows` audit section so the user can search rows already imported, see where each row counted, and manually move/count a row under the correct product.
- Product rows include a `CSV rows (#)` audit button beside `Open Amazon`; it opens a product-level attribution list of every imported CSV row currently counted toward that investment product.
- Product CSV attribution rows include `Remove attribution`; this marks the imported CSV row ignored so it no longer counts toward that product, while keeping the original CSV row searchable in the broader revenue audit.
- Imported revenue rows with generic/non-actionable labels or a 2% or lower likely-match score are marked `ignored` so they do not clutter Match Review. Exact ASIN/title matches, approved matches, and shared campaign/title repairs can still count automatically.
- Existing ignored rows are repaired back into Match Review only when they have a meaningful campaign/title or real ASIN and their current best likely match is above the 2% review cutoff.
- Match Review has a `Mass unmatch` button that marks all currently visible review rows as `ignored`; when search is active it only mass-unmatches the filtered/search-visible rows.
- The imported revenue audit hides `ignored` rows by default and has a `Show ignored rows` checkbox for troubleshooting.
- Exports for products, revenue, ROI summary, and full JSON backup.
- Sample data button for quickly seeing dashboard behavior.
- Purchased-products filter, per-product payback bars, storefront links, manual video status, and repeatable video records are part of the product ledger.
- Video records include video title/name, video link, posted date, and notes.
- `Top Products` tab shows imported earning products ranked by total commission regardless of whether they are investment products. It aggregates by normalized title first to roll together variation ASINs, then falls back to ASIN, and includes filters for matched investment products vs non-investment products.

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
  - Search local imported CSV/raw rows and existing saved products for matching ASIN/title/brand details.
- Autofill suggestions must be confidence-labeled: exact, likely, weak, or manual.
- Autofill must not overwrite user-entered fields until the user clicks `Apply autofill`.
- The implemented primary no-API autofill path is an Amazon page extractor/bookmarklet:
  - User opens an Amazon product page.
  - User clicks a saved browser bookmark/action such as `Send to AIP Dashboard`.
  - The script reads DOM fields directly from the product page, including title, byline/brand, price, breadcrumbs/category, ASIN, canonical link, and possibly image URL.
  - The script copies or downloads a small JSON payload.
  - The dashboard imports/applies that JSON with confidence labels.
- Saved HTML upload should remain the second-best reliable method after bookmarklet JSON capture.

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
- `app.js`: IndexedDB/Supabase data layer, rendering, product/revenue forms, CSV import, matching, exports, auth, and autofill parsing.
- `server.js`: tiny local static server.
- `start-dashboard.cmd`: Windows launcher.
- `start-dashboard.command`: Mac launcher.
- `README.md`: run instructions and local data note.

## Verification Already Done
- `node --check app.js` passed after the redesign/autofill update.
- `node --check server.js` passed.
- `node --check app.js` and `node --check server.js` passed after the CSV import history and match review/audit updates.
- Real user Creator Connections CSVs were inspected: the April 24-May 1 file had 65 rows and `$349.46` total earnings, and the four supplied files had `$4.40` in Peakeep-title rows and `$8.40` in all alarm-title rows.
- A local server smoke check returned 200 for `/`, `/styles.css`, and `/app.js`.
- A JS-to-HTML ID consistency check found no missing static element references.

## Future Work Ideas
- `HOW_TO_SETUP.md` is the non-technical setup document. Keep it updated as setup changes.
- `AIP_Dashboard_Setup_Guide.docx` is the Word version of the setup guide for sharing with less technical users.
- Before sharing widely, setup docs should clearly say users need Node.js installed first, then they can use `start-dashboard.cmd` on Windows.
- The how-to doc must clearly explain the correct workflow order: add/capture the investment product before uploading earnings CSVs. If the product is not in the dashboard first, imported income may stay unmatched or require review instead of counting toward that product's earnings.
- Consider adding a Linux starter file later if Linux users ask for an equally simple launch path.
- Add a one-click local receiver endpoint later if browser security allows a smooth localhost handoff; clipboard/download JSON is the reliable current method.
- Improve saved Amazon HTML parsing for title, byline/brand, price, breadcrumbs/category, ASIN, and image URL.
- Add a product image field and render thumbnails in the product table.
- Add better monthly import reconciliation if Amazon reporting formats become consistent.
- Add duplicate product warnings when a new ASIN/title is already tracked.
- Add backup reminder or automatic export prompt before clearing data.
