import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVoiceRecorder } from "./use-voice-recorder";

class FakeMediaRecorder {
  state = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream) {}
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.onstop?.();
  }
}

let recorder: ReturnType<typeof useVoiceRecorder>;
function Harness() {
  recorder = useVoiceRecorder(() => {});
  return null;
}

let container: HTMLDivElement;
let root: Root;
let resolveStream: (stream: MediaStream) => void;
let getUserMedia: ReturnType<typeof vi.fn>;
let track: { stop: ReturnType<typeof vi.fn> };

beforeEach(async () => {
  track = { stop: vi.fn() };
  getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        resolveStream = resolve;
      }),
  );
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const stream = () => ({ getTracks: () => [track] }) as unknown as MediaStream;

describe("useVoiceRecorder", () => {
  it("ignores a second start while the permission prompt is open", async () => {
    let first!: Promise<void>;
    await act(async () => {
      first = recorder.start();
      void recorder.start();
    });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveStream(stream());
      await first;
    });
    expect(recorder.status).toBe("recording");
  });

  it("releases the mic when unmounted during the permission prompt", async () => {
    let pending!: Promise<void>;
    await act(async () => {
      pending = recorder.start();
    });
    await act(async () => root.unmount());
    resolveStream(stream());
    await pending;
    expect(track.stop).toHaveBeenCalled();
    // afterEach unmounts again; give it a fresh root.
    root = createRoot(container);
  });
});
