import { describe, expect, it } from "vitest";
import {
  ALL_SIGNED_IN_ROUTES,
  AREA_SECONDARY_ROUTES,
  LEGACY_PRIMARY_ROUTE_REDIRECTS,
  PRIMARY_DESTINATIONS,
  ROUTE_TO_PRIMARY_AREA,
  SECONDARY_NAV_ITEMS,
  areaPrimaryDestination,
  areaSecondaryDestinations,
  primaryAreaForPath,
} from "./navigation";

describe("navigation model", () => {
  it("defines exactly four primary destinations in order", () => {
    expect(PRIMARY_DESTINATIONS.map((d) => d.area)).toEqual([
      "today",
      "talk",
      "insights",
      "you",
    ]);

    expect(PRIMARY_DESTINATIONS.map((d) => d.href)).toEqual([
      "/today",
      "/talk",
      "/insights",
      "/you",
    ]);
    expect(PRIMARY_DESTINATIONS.map((d) => d.label)).toEqual([
      "Today",
      "Talk",
      "Insights",
      "You",
    ]);
  });

  it("exposes every lower-frequency destination in the secondary list", () => {
    const secondaryHrefs = SECONDARY_NAV_ITEMS.map((i) => i.href);
    expect(secondaryHrefs).toContain("/app/morning");
    expect(secondaryHrefs).toContain("/app/scans");
    expect(secondaryHrefs).toContain("/app/evening");
    expect(secondaryHrefs).toContain("/app/habits");
    expect(secondaryHrefs).toContain("/app/medications");
    expect(secondaryHrefs).toContain("/app/reminders");
    expect(secondaryHrefs).toContain("/app/account");
    expect(secondaryHrefs).toContain("/app/archive");
  });

  it("presents every signed-in destination exactly once", () => {
    const expected = [
      "/today",
      "/app/morning",
      "/app/scans",
      "/app/evening",
      "/app/habits",
      "/app/medications",
      "/insights",
      "/you",
      "/app/account",
      "/talk",
      "/app/archive",
      "/app/reminders",
    ];
    expect(ALL_SIGNED_IN_ROUTES.sort()).toEqual(expected.sort());

    const presented = [
      ...PRIMARY_DESTINATIONS.map((d) => d.href),
      ...SECONDARY_NAV_ITEMS.map((i) => i.href),
    ];
    for (const href of expected) {
      expect(presented).toContain(href);
      expect(presented.filter((h) => h === href)).toHaveLength(1);
    }
  });

  it("maps daily-routine routes to the Today primary area", () => {
    for (const href of [
      "/today",
      "/app/morning",
      "/app/scans",
      "/app/evening",
      "/app/habits",
      "/app/medications",
      "/app/reminders",
    ]) {
      expect(ROUTE_TO_PRIMARY_AREA[href]).toBe("today");
    }
  });

  it("groups Talk, Insights, and You routes correctly", () => {
    expect(ROUTE_TO_PRIMARY_AREA["/talk"]).toBe("talk");
    expect(ROUTE_TO_PRIMARY_AREA["/app/archive"]).toBe("talk");
    expect(ROUTE_TO_PRIMARY_AREA["/insights"]).toBe("insights");
    expect(ROUTE_TO_PRIMARY_AREA["/you"]).toBe("you");
    expect(ROUTE_TO_PRIMARY_AREA["/app/account"]).toBe("you");
  });

  it("keeps the previous primary URLs as redirect aliases", () => {
    expect(LEGACY_PRIMARY_ROUTE_REDIRECTS).toEqual({
      "/app": "/today",
      "/app/chat": "/talk",
      "/app/reports": "/insights",
      "/app/profile": "/you",
      "/app/today": "/today",
      "/app/talk": "/talk",
      "/app/insights": "/insights",
      "/app/you": "/you",
    });
    expect(primaryAreaForPath("/app")).toBe("today");
    expect(primaryAreaForPath("/app/chat")).toBe("talk");
    expect(primaryAreaForPath("/app/reports")).toBe("insights");
    expect(primaryAreaForPath("/app/profile")).toBe("you");
    expect(primaryAreaForPath("/app/account/?tab=security#password")).toBe(
      "you",
    );
  });

  it("resolves a location path to its primary area", () => {
    expect(primaryAreaForPath("/app/morning")).toBe("today");
    expect(primaryAreaForPath("/app/archive")).toBe("talk");
    expect(primaryAreaForPath("/insights")).toBe("insights");
    expect(primaryAreaForPath("/today")).toBe("today");
  });

  it("returns null for unknown paths", () => {
    expect(primaryAreaForPath("/bogus")).toBeNull();
  });
});

describe("area destinations", () => {
  it("buckets every secondary route under its primary area, without loss", () => {
    const total = Object.values(AREA_SECONDARY_ROUTES).flat().length;
    expect(total).toBe(SECONDARY_NAV_ITEMS.length);
    expect(AREA_SECONDARY_ROUTES.talk.map((i) => i.href)).toEqual([
      "/app/archive",
    ]);
    expect(AREA_SECONDARY_ROUTES.you.map((i) => i.href)).toEqual([
      "/app/account",
    ]);
    expect(AREA_SECONDARY_ROUTES.insights).toEqual([]);
    expect(AREA_SECONDARY_ROUTES.today.map((i) => i.href)).toEqual([
      "/app/morning",
      "/app/scans",
      "/app/evening",
      "/app/habits",
      "/app/medications",
      "/app/reminders",
    ]);
  });

  it("lists a primary area's secondary destinations", () => {
    expect(areaSecondaryDestinations("talk").map((i) => i.href)).toEqual([
      "/app/archive",
    ]);
    expect(areaSecondaryDestinations("you").map((i) => i.href)).toEqual([
      "/app/account",
    ]);
    expect(areaSecondaryDestinations("insights")).toEqual([]);
  });

  it("excludes the page the visitor is already on", () => {
    expect(
      areaSecondaryDestinations("talk", { excludeHref: "/app/archive" }),
    ).toEqual([]);
    expect(
      areaSecondaryDestinations("you", { excludeHref: "/app/account" }),
    ).toEqual([]);
  });

  it("resolves the primary destination that anchors an area", () => {
    expect(areaPrimaryDestination("talk").href).toBe("/talk");
    expect(areaPrimaryDestination("talk").label).toBe("Talk");
    expect(areaPrimaryDestination("you").href).toBe("/you");
    expect(areaPrimaryDestination("insights").href).toBe("/insights");
    expect(areaPrimaryDestination("today").href).toBe("/today");
  });
});
