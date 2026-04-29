import { describe, expect, it } from "vitest";
import { searchBackendForProvider } from "../src/listing/search";

describe("searchBackendForProvider", () => {
  it("uses local Playwright for providers where medium search discovery passes", () => {
    expect(searchBackendForProvider("argenprop")).toBe("local-playwright");
    expect(searchBackendForProvider("airbnb")).toBe("local-playwright");
  });

  it("keeps Zonaprop on Playwriter because local Playwright is blocked", () => {
    expect(searchBackendForProvider("zonaprop")).toBe("playwriter");
  });
});
