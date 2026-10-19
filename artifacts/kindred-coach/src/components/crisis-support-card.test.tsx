import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CrisisSupportCard } from "./crisis-support-card";
import { CRISIS_RESOURCES } from "@/lib/crisisResources";
import { CRISIS_SUPPORT_CONFIG } from "../../../api-server/src/config/crisisSupport";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(live?: boolean) {
  await act(async () =>
    root.render(createElement(CrisisSupportCard, { live })),
  );
  return container.querySelector('[data-testid="crisis-support-card"]')!;
}

function links(resourceId: string) {
  return [
    ...container.querySelectorAll(
      `[data-testid="crisis-resource-${resourceId}"] a`,
    ),
  ].map((a) => [a.textContent, a.getAttribute("href")]);
}

describe("CrisisSupportCard", () => {
  it("lists 911, 9-8-8 for Canada and the US, and findahelpline.com elsewhere", async () => {
    const card = await render();
    expect(card.textContent).toContain(
      "Kindred is not medical care or an emergency service.",
    );

    expect(links("emergency")).toEqual([["Call 911", "tel:911"]]);
    expect(card.textContent).toContain("9-8-8 Suicide Crisis Helpline");
    expect(links("ca-988")).toEqual([
      ["Call 9-8-8", "tel:988"],
      ["Text 9-8-8", "sms:988"],
    ]);
    expect(card.textContent).toContain("988 Suicide & Crisis Lifeline");
    expect(links("us-988")).toEqual([
      ["Call 988", "tel:988"],
      ["Text 988", "sms:988"],
    ]);
    expect(links("international")).toEqual([
      ["findahelpline.com", "https://findahelpline.com/"],
    ]);
    const web = container.querySelector(
      '[data-testid="crisis-resource-international"] a',
    )!;
    expect(web.getAttribute("target")).toBe("_blank");
    expect(web.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("is announced only when it arrives live", async () => {
    expect((await render(true)).getAttribute("role")).toBe("alert");
    expect((await render(false)).getAttribute("role")).toBeNull();
  });

  it("shows the same resources as the server's reviewed crisis config", () => {
    expect(CRISIS_RESOURCES).toEqual(CRISIS_SUPPORT_CONFIG.resources);
  });
});
