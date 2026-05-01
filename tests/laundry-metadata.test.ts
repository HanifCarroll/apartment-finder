import { describe, expect, test } from "bun:test";
import { classifyAirbnbDescriptionLaundrySignal } from "../src/laundry-metadata";

describe("classifyAirbnbDescriptionLaundrySignal", () => {
  test("treats building laundry text as shared-building metadata", () => {
    expect(classifyAirbnbDescriptionLaundrySignal("Pool and laundry available in the building!")?.classification)
      .toBe("SHARED_BUILDING");
  });

  test("does not treat nearby laundromats as listing laundry metadata", () => {
    expect(classifyAirbnbDescriptionLaundrySignal("There is a laundromat nearby.")).toBeNull();
  });
});
