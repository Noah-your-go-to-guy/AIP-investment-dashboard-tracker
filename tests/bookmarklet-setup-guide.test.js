const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("setup tab explains the complete one-time Chrome bookmarklet setup", () => {
  for (const instruction of [
    "One-time setup in Chrome",
    "Ctrl + Shift + B",
    "Right-click an empty area of the bookmarks bar",
    "Add page",
    "Send to AIP Dashboard",
    "URL field",
  ]) {
    assert.match(indexHtml, new RegExp(instruction.replace(/[+]/g, "\\+")));
  }
});

test("setup tab explains how to capture and import each investment product", () => {
  for (const instruction of [
    "For every investment product",
    "Open the exact Amazon product page",
    "Copied product capture JSON",
    "Add product",
    "Import pasted capture",
    "Apply autofill",
    "Save product",
  ]) {
    assert.match(indexHtml, new RegExp(instruction));
  }
});

test("setup tab includes bookmarklet troubleshooting", () => {
  assert.match(indexHtml, /If clicking the bookmark appears to do nothing/);
  assert.match(indexHtml, /javascript:/);
  assert.match(indexHtml, /Upload capture JSON/);
});

test("bookmarklet setup guide stacks for smaller screens", () => {
  assert.match(stylesCss, /@media \(max-width: 880px\)[\s\S]*\.setup-install-layout[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(stylesCss, /@media \(max-width: 880px\)[\s\S]*\.setup-bookmarklet-card[\s\S]*position:\s*static/);
});

test("earnings CSV warning appears before the bookmarklet instructions", () => {
  const warningIndex = indexHtml.indexOf("Add products before uploading earnings CSVs.");
  const instructionsIndex = indexHtml.indexOf("One-time setup in Chrome");

  assert.notEqual(warningIndex, -1);
  assert.notEqual(instructionsIndex, -1);
  assert.ok(warningIndex < instructionsIndex);
});
