#!/usr/bin/env bun
import { Command } from "commander";
import { createBrowserSession, type BrowserBackend } from "../src/browser/backend";
import { SITE_SMOKE_CASES } from "../src/site-smoke-cases";
import type { SearchProvider } from "../src/providers/search";

const program = new Command()
  .name("bun run smoke:browser:sites")
  .description("Load supported provider search pages with local Playwright or Browserbase.")
  .option("--backend <backend>", "Browser backend: local or browserbase", process.env.BROWSER_BACKEND || "local")
  .option("--provider <provider>", "Only check one provider: zonaprop, argenprop, or airbnb")
  .parse(process.argv);

const options = program.opts<{ backend: BrowserBackend; provider?: SearchProvider }>();
if (options.backend === "browserbase") {
  throw new Error("Run Browserbase site checks with `bun run smoke:browserbase:sites` so Playwright CDP connects under Node.");
}

const cases = options.provider
  ? SITE_SMOKE_CASES.filter((item) => item.provider === options.provider)
  : SITE_SMOKE_CASES;

if (cases.length === 0) {
  throw new Error(`No site smoke case found for provider: ${options.provider}`);
}

const session = await createBrowserSession(options.backend);
try {
  console.error(`Using ${session.backend} browser${session.sessionId ? ` session ${session.sessionId}` : ""}.`);

  for (const smokeCase of cases) {
    const page = await session.context.newPage();
    const response = await page.goto(smokeCase.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(2500);

    const title = await page.title().catch(() => "");
    const bodyText = await page.locator("body").innerText({ timeout: 5000 }).catch(() => "");
    const linkCount = await page.locator("a[href]").count().catch(() => 0);
    const status = response?.status() ?? null;
    const blocked = status === 403 || /just a moment|captcha|verify you are human/i.test(`${title}\n${bodyText}`);
    const ok = !blocked && bodyText.length >= smokeCase.minBodyChars && linkCount >= smokeCase.minLinks;

    console.log(JSON.stringify({
      ok,
      provider: smokeCase.provider,
      backend: session.backend,
      browserbase_session_id: session.sessionId,
      status,
      final_url: page.url(),
      title: title.slice(0, 140),
      body_chars: bodyText.length,
      link_count: linkCount,
      blocked,
    }));

    await page.close();
  }
} finally {
  await session.close();
}
