// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { announceSessionChange, listenForSessionChange } from "./session-events";
afterEach(() => vi.unstubAllGlobals());
it("ignores its own broadcast so logout waits for the server, but invalidates other documents", () => {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage?: (event: { data: unknown }) => void;
    constructor() {
      channels.push(this);
    }
    postMessage(data: unknown) {
      channels
        .filter((channel) => channel !== this)
        .forEach((channel) => channel.onmessage?.({ data }));
    }
    close() {}
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  const invalidate = vi.fn();
  const stop = listenForSessionChange(invalidate);
  announceSessionChange();
  expect(invalidate).not.toHaveBeenCalled();
  new FakeChannel().postMessage({ type: "invalidate", source: "another-document" });
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(localStorage.length).toBe(0);
  stop();
});
it("uses a token-free storage notification when BroadcastChannel is unavailable", () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  const invalidate = vi.fn();
  const stop = listenForSessionChange(invalidate);
  window.dispatchEvent(
    new StorageEvent("storage", {
      key: "directsourcing-session-invalidation",
      newValue: "random-signal",
    }),
  );
  expect(invalidate).toHaveBeenCalledTimes(1);
  stop();
});
