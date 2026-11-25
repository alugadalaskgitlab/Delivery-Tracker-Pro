import test from "node:test";
import assert from "node:assert/strict";
import {
  deletePartySafely,
  deleteSiteSafely,
  partyDeletionBlockedMessage,
  siteDeletionBlockedMessage,
  type PartyDeleteOperations,
  type SiteDeleteOperations,
} from "./delete-operations";

test("delete refusal messages include the exact challan counts and instructions", () => {
  assert.equal(siteDeletionBlockedMessage(3), "This site has 3 challans and cannot be deleted. Make the party inactive instead.");
  assert.equal(partyDeletionBlockedMessage(5), "This party has 5 challans and cannot be deleted. Make it inactive instead.");
});

test("site without challans deletes its counter before the site", async () => {
  const calls: string[] = [];
  const operations: SiteDeleteOperations = {
    countSiteChallans: async () => 0,
    deleteSiteChallanSequences: async () => { calls.push("challan-sequence"); },
    deleteSite: async () => { calls.push("site"); return true; },
  };
  const result = await deleteSiteSafely("site-1", operations);
  assert.deepEqual(result, { deleted: true, challanCount: 0 });
  assert.deepEqual(calls, ["challan-sequence", "site"]);
});

test("site with challans is refused without deleting anything", async () => {
  const calls: string[] = [];
  const operations: SiteDeleteOperations = {
    countSiteChallans: async () => 3,
    deleteSiteChallanSequences: async () => { calls.push("challan-sequence"); },
    deleteSite: async () => { calls.push("site"); return true; },
  };
  const result = await deleteSiteSafely("site-1", operations);
  assert.deepEqual(result, { deleted: false, challanCount: 3 });
  assert.deepEqual(calls, []);
});

test("party without challans deletes dependent rows in safe order", async () => {
  const calls: string[] = [];
  const operations: PartyDeleteOperations = {
    countPartyChallans: async () => 0,
    getPartySiteIds: async () => ["site-1", "site-2"],
    deletePartySiteChallanSequences: async (ids) => { calls.push(`challan-sequences:${ids.join(",")}`); },
    deletePartySites: async () => { calls.push("sites"); },
    deletePartySiteSequence: async () => { calls.push("site-sequence"); },
    deletePartyTokens: async () => { calls.push("site-tokens"); },
    deleteParty: async () => { calls.push("party"); return true; },
  };
  const result = await deletePartySafely("party-1", operations);
  assert.deepEqual(result, { deleted: true, challanCount: 0 });
  assert.deepEqual(calls, ["challan-sequences:site-1,site-2", "sites", "site-sequence", "site-tokens", "party"]);
});

test("party with challans is refused without deleting anything", async () => {
  const calls: string[] = [];
  const operations: PartyDeleteOperations = {
    countPartyChallans: async () => 5,
    getPartySiteIds: async () => { calls.push("sites"); return []; },
    deletePartySiteChallanSequences: async () => { calls.push("challan-sequences"); },
    deletePartySites: async () => { calls.push("delete-sites"); },
    deletePartySiteSequence: async () => { calls.push("site-sequence"); },
    deletePartyTokens: async () => { calls.push("site-tokens"); },
    deleteParty: async () => { calls.push("party"); return true; },
  };
  const result = await deletePartySafely("party-1", operations);
  assert.deepEqual(result, { deleted: false, challanCount: 5 });
  assert.deepEqual(calls, []);
});
