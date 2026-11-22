import test from "node:test";
import assert from "node:assert/strict";
import { getAlertPresentation, matchesApplicationServerKey } from "./notification-state.js";

const base = {
  loading: false,
  subscribed: false,
  permission: "default" as NotificationPermission,
  needsPwa: false,
  supported: true,
};

test("shows the alert card when there is no active subscription", () => {
  assert.equal(getAlertPresentation(base), "prompt");
});

test("hides the alert card and shows active state when subscribed", () => {
  assert.equal(getAlertPresentation({ ...base, subscribed: true, permission: "granted" }), "active");
});

test("shows the alert card again when a subscription is invalid", () => {
  // A stale or missing server subscription is normalized to subscribed=false.
  assert.equal(getAlertPresentation({ ...base, subscribed: false, permission: "granted" }), "prompt");
});

test("treats a subscription created with an old VAPID key as invalid", () => {
  const oldKey = Uint8Array.from([1, 2, 3, 4]).buffer;
  assert.equal(matchesApplicationServerKey(oldKey, "BQYHCA"), false);
  assert.equal(getAlertPresentation({ ...base, subscribed: false, permission: "granted" }), "prompt");
});

test("recognizes a subscription created with the current VAPID key", () => {
  const currentKey = Uint8Array.from([1, 2, 3, 4]).buffer;
  assert.equal(matchesApplicationServerKey(currentKey, "AQIDBA"), true);
});

test("shows Add to Home Screen guidance for iPhone Safari outside the installed app", () => {
  assert.equal(getAlertPresentation({ ...base, needsPwa: true, loading: true }), "ios-install");
});

test("keeps the card visible with the blocked-permission state", () => {
  assert.equal(getAlertPresentation({ ...base, permission: "denied" }), "blocked");
});
