import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteMedication: vi.fn(),
}));

vi.mock("@workspace/api-client-react", () => ({
  getListMedicationsQueryKey: () => ["/api/medications"],
  useListMedications: () => ({
    data: [
      {
        id: 5,
        name: "Vitamin D",
        dosage: "1000 IU",
        times: ["08:00"],
        notes: null,
        doses: [],
      },
    ],
    isLoading: false,
  }),
  createMedication: vi.fn(),
  updateMedication: vi.fn(),
  deleteMedication: mocks.deleteMedication,
  logMedicationTaken: vi.fn(),
  unlogMedicationTaken: vi.fn(),
}));

import Medications from "./medications";

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
  vi.restoreAllMocks();
});

describe("Medications delete", () => {
  it("deletes after the dialog is confirmed, with no second browser confirm", async () => {
    // Cancelling a leftover window.confirm() used to drop the delete silently.
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mocks.deleteMedication.mockResolvedValue(undefined);
    await act(async () =>
      root.render(
        createElement(
          QueryClientProvider,
          { client: new QueryClient() },
          createElement(Medications),
        ),
      ),
    );

    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[data-testid="delete-med-5"]')!
        .click(),
    );
    const action = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Delete",
    )!;
    await act(async () => action.click());

    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.deleteMedication).toHaveBeenCalledWith(5);
  });
});
