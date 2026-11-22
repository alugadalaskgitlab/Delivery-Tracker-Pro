export type AlertPresentation =
  | "loading"
  | "active"
  | "blocked"
  | "ios-install"
  | "prompt"
  | "hidden";

export function matchesApplicationServerKey(
  actual: ArrayBuffer | ArrayBufferView | null,
  expectedBase64UrlKey: string,
): boolean {
  if (!actual || !expectedBase64UrlKey) return false;
  try {
    const padded = expectedBase64UrlKey.padEnd(Math.ceil(expectedBase64UrlKey.length / 4) * 4, "=");
    const decoded = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    const expected = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const actualBytes = actual instanceof ArrayBuffer
      ? new Uint8Array(actual)
      : new Uint8Array(actual.buffer, actual.byteOffset, actual.byteLength);
    return expected.length === actualBytes.length
      && expected.every((byte, index) => byte === actualBytes[index]);
  } catch {
    return false;
  }
}

export function getAlertPresentation(input: {
  loading: boolean;
  subscribed: boolean;
  permission: NotificationPermission;
  needsPwa: boolean;
  supported: boolean;
}): AlertPresentation {
  if (input.needsPwa) return "ios-install";
  if (input.loading) return "loading";
  if (!input.supported) return "hidden";
  if (input.permission === "denied") return "blocked";
  if (input.subscribed) return "active";
  return "prompt";
}
