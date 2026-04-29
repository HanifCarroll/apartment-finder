import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext } from "playwright";

export type BrowserBackend = "local" | "browserbase";

export type BrowserSession = {
  backend: BrowserBackend;
  sessionId?: string;
  context: BrowserContext;
  close: () => Promise<void>;
};

export function browserBackendFromEnv(): BrowserBackend {
  const backend = process.env.BROWSER_BACKEND || "local";
  if (backend === "local" || backend === "browserbase") return backend;
  throw new Error(`Unsupported BROWSER_BACKEND: ${backend}`);
}

export async function createBrowserSession(backend = browserBackendFromEnv()): Promise<BrowserSession> {
  if (backend === "browserbase") {
    return createBrowserbaseSession();
  }

  return createLocalBrowserSession();
}

async function createLocalBrowserSession(): Promise<BrowserSession> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    locale: "es-AR",
    timezoneId: "America/Argentina/Buenos_Aires",
    viewport: { width: 1365, height: 900 },
    extraHTTPHeaders: {
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    },
  });

  return {
    backend: "local",
    context,
    close: async () => browser.close(),
  };
}

async function createBrowserbaseSession(): Promise<BrowserSession> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey) throw new Error("BROWSERBASE_API_KEY is required for BROWSER_BACKEND=browserbase.");
  if (!projectId) throw new Error("BROWSERBASE_PROJECT_ID is required for BROWSER_BACKEND=browserbase.");

  const bb = new Browserbase({ apiKey });
  const session = await bb.sessions.create({
    projectId,
  });

  const browser: Browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] ?? await browser.newContext();

  return {
    backend: "browserbase",
    sessionId: session.id,
    context,
    close: async () => browser.close(),
  };
}
