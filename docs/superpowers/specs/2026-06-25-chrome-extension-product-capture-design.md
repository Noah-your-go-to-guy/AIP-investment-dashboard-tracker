# Chrome Extension Product Capture Design

## Goal

Make adding investment products dramatically easier by replacing the bookmarklet-first workflow with a Chrome extension MVP.

The first version should let a user open an Amazon product page, click the AIP extension, review a small overlay, and save the product directly to their cloud dashboard as a bought investment product.

## Problem

The current product capture workflow requires too much back and forth:

- Visit Amazon.
- Click a bookmarklet.
- Confirm copied JSON or find a downloaded JSON file.
- Return to the dashboard.
- Open the product dialog.
- Paste or upload the capture.
- Apply it.
- Save the product.

That workflow works, but it feels fragile and is too much friction for normal users, especially when adding many products.

## MVP Scope

The Chrome extension MVP will focus only on product intake.

It will not automate earnings CSV/report downloads yet. The extension should be designed so report automation can be added later, but the first milestone is one-click product capture.

## User Workflow

1. User installs the unpacked Chrome extension from the GitHub repo.
2. User signs into the extension with the same account used in the hosted AIP dashboard.
3. User opens an Amazon product page.
4. User clicks the AIP extension button.
5. A compact overlay opens on the Amazon page.
6. The extension reads the Amazon page and fills:
   - title
   - ASIN
   - brand
   - category or breadcrumb
   - Amazon price
   - Amazon link
7. The overlay lets the user edit:
   - purchase price
   - purchase date
8. The overlay has one primary product action:
   - `Save as bought`
9. Saving creates or updates a dashboard product with:
   - `status`: `bought`
   - `purchaseDate`: selected purchase date, defaulting to today
   - `purchasePrice`: detected Amazon price unless edited
   - `tax`: `0`
   - `shipping`: `0`
   - `discounts`: `0`
   - `refunds`: `0`
10. After saving, the overlay shows a success state and an `Open dashboard` button.

## Extension Architecture

Create a new `extension/` folder in the repo.

Recommended files:

- `extension/manifest.json`
- `extension/background.js`
- `extension/content.js`
- `extension/content.css`
- `extension/popup.html`
- `extension/popup.js`
- `extension/supabase-client.js`
- `extension/icons/`

The extension should use Manifest V3.

Chrome content scripts can read and change the DOM of pages they run on, which fits the Amazon overlay flow. The extension should use Amazon host permissions and inject the capture overlay only on Amazon product pages.

## Data Flow

The product extractor in `content.js` should reuse the same field-detection logic already used by the dashboard bookmarklet where practical:

- `#productTitle`
- `#bylineInfo`
- `input[name="ASIN"]`
- canonical product URL
- visible Amazon price selectors
- breadcrumb/category selectors
- product detail tables for brand/manufacturer fallback

The extension should normalize the product into the existing dashboard product shape and write it to Supabase.

Products should use stable IDs that prevent duplicate copies of the same bought product where possible. A reasonable MVP rule:

- If ASIN exists, product ID can be based on ASIN.
- If a product with that ID already exists for the signed-in user, the extension updates that product instead of creating a duplicate.

## Authentication

The MVP should use the same Supabase project and authenticated user model as the hosted dashboard.

For the simplest first version:

- The extension popup asks for email and password.
- It signs in through Supabase Auth.
- The session is stored in Chrome extension storage.
- Product saves use the signed-in user's Supabase access token.

The dashboard remains the main place to create an account, inspect products, upload CSVs, and manage data. The extension is a focused capture tool.

## Dashboard Changes

Update the dashboard `Setup` tab:

- Make the Chrome extension the recommended product capture path.
- Keep the bookmarklet as a fallback.
- Add simple unpacked-extension setup instructions:
  - download or clone the GitHub repo
  - open `chrome://extensions`
  - enable Developer mode
  - click `Load unpacked`
  - select the `extension` folder
  - pin the AIP extension
  - sign in with the dashboard account

The setup copy should clearly say that CSV uploads still happen in the dashboard.

## UI Design

The Amazon overlay should be small and practical:

- fixed panel near the upper-right of the page
- strong title like `AIP Product Capture`
- detected product title, ASIN, brand, category, and Amazon price
- editable `Purchase price`
- editable `Purchase date`
- one primary button: `Save as bought`
- secondary button: `Open dashboard`
- clear error state if product details cannot be detected
- clear signed-out state if the extension is not authenticated

The overlay should avoid blocking Amazon's buy box or product image when possible.

## Error Handling

The extension should handle:

- not signed in
- not on an Amazon product page
- ASIN not detected
- price not detected
- Supabase save failed
- network unavailable
- product already exists

If price is not detected, the user can type purchase price manually before saving.

If ASIN is not detected, do not save automatically. Ask the user to open the product detail page or use the dashboard fallback.

## Security And Privacy

The extension should request only the permissions it needs:

- Amazon product page access
- extension storage
- network access to Supabase and the hosted dashboard

Do not scrape unrelated browsing data. Do not store Amazon page HTML. Do not store passwords manually; rely on Supabase Auth session tokens in extension storage.

## Future Report Automation

This design should not block later report automation.

Later phases could add:

- report-download helper from Amazon Creator/AIP pages
- guided automation that opens the report page and downloads selected reports
- direct import of downloaded CSV files into the dashboard
- clearer health checks showing what reports have been imported

Those should come after the product-capture extension is stable.

## Testing Plan

Manual tests:

- Install extension unpacked in Chrome.
- Sign in with an existing dashboard account.
- Open a normal Amazon product page.
- Confirm the overlay detects title, ASIN, brand, category, Amazon price, and link.
- Edit purchase date.
- Edit purchase price.
- Click `Save as bought`.
- Open hosted dashboard and confirm product appears with `bought` status and selected purchase date.
- Save the same ASIN again and confirm it updates instead of duplicating.
- Test a product where price is missing and confirm manual price entry works.
- Test signed-out state.
- Test non-product Amazon pages.

Automated tests:

- Unit test product extraction helpers against saved Amazon-like HTML snippets.
- Unit test product normalization into dashboard product shape.
- Unit test duplicate ASIN update behavior.
- Unit test purchase date default and edited value.

## Out Of Scope For MVP

- Chrome Web Store publishing.
- CSV/report automation.
- Storefront/video scraping.
- Multi-browser support.
- Fully automatic purchase detection.
- Saving researched-only products from the extension.

## MVP Decision

The MVP will support only `Save as bought` from the extension. Other statuses remain editable from the dashboard product table or edit dialog.
