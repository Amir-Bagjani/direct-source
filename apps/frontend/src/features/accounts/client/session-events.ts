"use client";

const channelName = "directsourcing-session";
const signalKey = "directsourcing-session-invalidation";
let documentId: string | undefined;
function sourceId() {
  return (documentId ??= crypto.randomUUID());
}

export function announceSessionChange() {
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(channelName);
    channel.postMessage({ type: "invalidate", source: sourceId() });
    channel.close();
  }
  // Fallback contains no identity, token or personal data and is removed immediately.
  try {
    localStorage.setItem(signalKey, crypto.randomUUID());
    localStorage.removeItem(signalKey);
  } catch {
    /* visibility validation remains authoritative */
  }
}

export function listenForSessionChange(invalidate: () => void) {
  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : null;
  if (channel)
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      if (
        typeof data === "object" &&
        data !== null &&
        "type" in data &&
        data.type === "invalidate" &&
        "source" in data &&
        typeof data.source === "string" &&
        data.source !== sourceId()
      )
        invalidate();
    };
  const storage = (event: StorageEvent) => {
    if (event.key === signalKey && event.newValue) invalidate();
  };
  window.addEventListener("storage", storage);
  return () => {
    channel?.close();
    window.removeEventListener("storage", storage);
  };
}

// Same-document logout masks protected forms before the server revocation starts.
export function notifySessionClosing(failed = false) {
  window.dispatchEvent(new CustomEvent("directsourcing-session-closing", { detail: failed }));
}
export function listenForSessionClosing(listener: (failed: boolean) => void) {
  const receive = (event: Event) => {
    if (event instanceof CustomEvent && typeof event.detail === "boolean") listener(event.detail);
  };
  window.addEventListener("directsourcing-session-closing", receive);
  return () => window.removeEventListener("directsourcing-session-closing", receive);
}
