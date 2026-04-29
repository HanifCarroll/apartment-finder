#!/usr/bin/env bun
import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent("<main><h1>Apartment Finder</h1></main>");
  const heading = await page.getByRole("heading", { name: "Apartment Finder" }).textContent();
  if (heading !== "Apartment Finder") {
    throw new Error("Playwright smoke check could not read the test page heading.");
  }
  console.log(`Playwright Chromium smoke check passed (${browser.version()})`);
} finally {
  await browser.close();
}
