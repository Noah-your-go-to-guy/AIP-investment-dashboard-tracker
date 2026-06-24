# Break-Even Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a temporary break-even calculator tab that estimates monthly Amazon earnings and break-even days without changing saved dashboard data.

**Architecture:** Keep the financial math in a pure `calculateBreakEven` function in `app.js`. Render a dedicated static calculator panel in `index.html`, update result elements from input events, and add scoped responsive styles in `styles.css`.

**Tech Stack:** Vanilla HTML, CSS, JavaScript, Node test runner

---

### Task 1: Calculation engine

**Files:**
- Create: `tests/break-even-calculator.test.js`
- Modify: `app.js`

- [ ] Write tests for the screenshot example, zero projected earnings, and resale-covered purchases.
- [ ] Run `node --test tests/break-even-calculator.test.js` and confirm the missing calculator function fails.
- [ ] Add `calculateBreakEven` as a pure function using decimal percentage conversion and safe zero handling.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Calculator tab and live results

**Files:**
- Modify: `index.html`
- Modify: `app.js`
- Test: `tests/break-even-calculator.test.js`

- [ ] Test for the Calculator tab, eight inputs, results, estimate disclaimer, and input event binding.
- [ ] Run the focused test and confirm the interface assertions fail.
- [ ] Add the split calculator markup and `renderBreakEvenCalculator` event flow.
- [ ] Re-run the focused test and confirm it passes.

### Task 3: Responsive presentation and full verification

**Files:**
- Modify: `styles.css`
- Modify: `agent.md`
- Test: `tests/break-even-calculator.test.js`

- [ ] Test that the calculator uses a two-column desktop layout and one-column mobile layout.
- [ ] Add scoped finance-dashboard styling and responsive stacking.
- [ ] Document the calculator behavior in `agent.md`.
- [ ] Run `node --test tests/*.test.js`, syntax checks, `git diff --check`, and an HTTP smoke test.
