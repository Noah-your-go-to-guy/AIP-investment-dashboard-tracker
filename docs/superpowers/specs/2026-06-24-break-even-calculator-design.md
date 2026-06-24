# Break-Even Calculator Design

## Purpose

Add a temporary calculator for evaluating a possible investment product before purchase. Estimates must remain separate from saved products, imported commissions, Supabase records, and dashboard ROI totals.

## Inputs

- Monthly Amazon unit sales
- Attributed velocity percentage, defaulting to 4%
- Number of influencer videos in the carousel
- Amazon product price used for commission calculations
- Standard commission percentage
- Creator Connections bonus percentage
- Investment price actually paid
- Expected net resale cash after fees and shipping

## Calculations

`Attributed sales = monthly sales * attributed velocity / carousel videos`

`Monthly Amazon earnings = attributed sales * Amazon price * (commission rate + CC bonus rate)`

`Net investment = max(investment price - expected resale cash, 0)`

`Days to break even = (net investment / monthly Amazon earnings) * 30`

When resale covers the full investment, break even is zero days and any expected resale surplus is shown separately. When projected monthly earnings are zero, the calculator explains that break even cannot yet be estimated.

## Interface

Add a dedicated `Calculator` tab. Use a responsive split workspace with assumptions on the left and live results on the right. Inputs update immediately and are not persisted. Show the substituted equation and a clear estimate-only disclaimer.

## Verification

Test the supplied example (100 sales, 4% velocity, 4 videos, $100 Amazon price, 2% commission, 20% CC bonus, $100 investment, $50 resale) for $22 monthly earnings, $50 net investment, and approximately 68.18 days to break even. Test zero earnings and resale-covered cases, the required interface controls, and mobile stacking.
