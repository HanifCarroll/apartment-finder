#!/usr/bin/env node
import fs from "node:fs";
import Browserbase from "@browserbasehq/sdk";
import { Command } from "commander";
import { chromium } from "playwright";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}

const siteSmokeCases = [
  {
    provider: "zonaprop",
    url: "https://www.zonaprop.com.ar/inmuebles-alquiler-temporal-nunez-las-canitas-con-amoblado-menos-1500-dolar.html",
    minBodyChars: 1000,
    minLinks: 10,
  },
  {
    provider: "argenprop",
    url: "https://www.argenprop.com/departamentos/alquiler-temporal/las-canitas-o-nunez/dolares-hasta-1500?con-amoblado",
    minBodyChars: 1000,
    minLinks: 10,
  },
  {
    provider: "airbnb",
    url: "https://www.airbnb.com/s/Nu%C3%B1ez--Buenos-Aires/homes?place_id=ChIJtRA2Ov62vJURh2h44yGJvKI&refinement_paths%5B%5D=%2Fhomes&checkin=2026-06-14&checkout=2026-08-23&date_picker_type=calendar&adults=1&guests=1&query=Nu%C3%B1ez%2C%20Buenos%20Aires&amenities%5B%5D=33&room_types%5B%5D=Entire%20home%2Fapt&price_max=1500",
    minBodyChars: 1000,
    minLinks: 10,
  },
];

function envFlag(name) {
  return ["1", "true", "yes"].includes((process.env[name] || "").toLowerCase());
}

const program = new Command()
  .name("bun run smoke:browserbase:sites")
  .description("Load supported provider search pages through Browserbase.")
  .option("--provider <provider>", "Only check one provider: zonaprop, argenprop, or airbnb")
  .parse(process.argv);

const options = program.opts();
const cases = options.provider
  ? siteSmokeCases.filter((item) => item.provider === options.provider)
  : siteSmokeCases;

if (cases.length === 0) {
  throw new Error(`No site smoke case found for provider: ${options.provider}`);
}

if (!process.env.BROWSERBASE_API_KEY) throw new Error("BROWSERBASE_API_KEY is required.");
if (!process.env.BROWSERBASE_PROJECT_ID) throw new Error("BROWSERBASE_PROJECT_ID is required.");

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });

for (const smokeCase of cases) {
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    browserSettings: {
      solveCaptchas: true,
      os: process.env.BROWSERBASE_OS || "linux",
      viewport: { width: 1365, height: 900 },
    },
    proxies: envFlag("BROWSERBASE_PROXY"),
    timeout: 300,
  });

  let browser;
  try {
    browser = await chromium.connectOverCDP(session.connectUrl, { timeout: 120_000 });
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();
    const response = await page.goto(smokeCase.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(4500);

    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const linkCount = await page.locator("a[href]").count().catch(() => 0);
    const status = response?.status() ?? null;
    const blocked = status === 403 || /just a moment|un momento|captcha|verify you are human/i.test(`${title}\n${bodyText}`);
    const ok = !blocked && bodyText.length >= smokeCase.minBodyChars && linkCount >= smokeCase.minLinks;

    console.log(JSON.stringify({
      ok,
      provider: smokeCase.provider,
      backend: "browserbase",
      browserbase_session_id: session.id,
      status,
      final_url: page.url(),
      title: title.slice(0, 140),
      body_chars: bodyText.length,
      link_count: linkCount,
      blocked,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      provider: smokeCase.provider,
      backend: "browserbase",
      browserbase_session_id: session.id,
      error: error instanceof Error ? error.message : String(error),
    }));
  } finally {
    if (browser) await browser.close();
  }
}
