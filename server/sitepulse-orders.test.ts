import test from "node:test";
import assert from "node:assert/strict";
import type { Party, Site, SitePulseOrder } from "@shared/schema";
import { calculateSitePulseOrderReceivedMT, receiveSitePulseOrder, sitePulseOrderSchema } from "./sitepulse-orders";

const baseOrder = {
  sitePulseOrderId: "order-ext-1",
  partyName: "High Lane",
  sitePulsePartyId: "party-ext-1",
  siteName: "North Yard",
  sitePulseSiteId: "site-ext-1",
  orderNumber: "SO-17",
  mixLines: [{ mix: "DBM", orderedMT: 40 }],
  periodFrom: "2026-11-01",
  periodTo: "2026-11-30",
  status: "open",
};

function mockStorage(initialParty?: Party, initialSite?: Site) {
  const parties: Party[] = initialParty ? [initialParty] : [];
  const sites: Site[] = initialSite ? [initialSite] : [];
  const orders = new Map<string, SitePulseOrder>();
  const orderLines = new Map<string, any[]>();
  let partyCreates = 0;
  let siteCreates = 0;
  const storage = {
    getParties: async () => parties,
    getAllSites: async () => sites,
    createParty: async (input: any) => {
      partyCreates += 1;
      const party = { id: `party-${partyCreates}`, ...input } as Party;
      parties.push(party);
      return party;
    },
    updateParty: async (id: string, changes: any) => {
      const party = parties.find((item) => item.id === id)!;
      Object.assign(party, changes);
      return party;
    },
    createSite: async (input: any) => {
      siteCreates += 1;
      const site = { id: `site-${siteCreates}`, ...input } as Site;
      sites.push(site);
      return site;
    },
    updateSite: async (id: string, changes: any) => {
      const site = sites.find((item) => item.id === id)!;
      Object.assign(site, changes);
      return site;
    },
    generatePartyCode: async () => "HLC",
    generateSiteCode: async () => "HLC-NY",
    upsertSitePulseOrder: async (input: any, lines: any[]) => {
      const previous = orders.get(input.sitePulseOrderId);
      const saved = { id: previous?.id || "order-1", ...previous, ...input } as SitePulseOrder;
      orders.set(input.sitePulseOrderId, saved);
      orderLines.set(saved.id, lines);
      return saved;
    },
  };
  return { storage: storage as any, parties, sites, orders, orderLines, getCreateCounts: () => ({ partyCreates, siteCreates }) };
}

test("order schema returns field-specific validation messages", () => {
  const result = sitePulseOrderSchema.safeParse({ ...baseOrder, siteName: "" });
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0].path[0], "siteName");
});

test("creates a linked party, site, and order without setting an SMS mobile", async () => {
  const mock = mockStorage();
  const parsed = sitePulseOrderSchema.parse(baseOrder);
  const result = await receiveSitePulseOrder(parsed, mock.storage, () => "generated-access");
  assert.equal(result.site.siteCode, "HLC-NY");
  assert.equal(result.site.accessId, "generated-access");
  assert.equal(result.site.notifyMobile, null);
  assert.equal(result.site.sitePulseSiteId, "site-ext-1");
  assert.equal(result.order.siteId, result.site.id);
  assert.deepEqual(mock.getCreateCounts(), { partyCreates: 1, siteCreates: 1 });
});

test("updates order quantity, period, and closed status by SitePulse order id", async () => {
  const mock = mockStorage();
  const first = sitePulseOrderSchema.parse(baseOrder);
  const created = await receiveSitePulseOrder(first, mock.storage, () => Math.random().toString());
  const updated = sitePulseOrderSchema.parse({
    ...baseOrder,
    mixLines: [{ mix: "DBM", orderedMT: 55 }],
    periodFrom: "2026-12-01",
    periodTo: "2026-12-31",
    status: "closed",
  });
  const result = await receiveSitePulseOrder(updated, mock.storage, () => "unused");
  assert.equal(result.order.id, created.order.id);
  assert.equal(result.order.status, "CLOSED");
  assert.equal(result.order.periodFrom.toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(mock.orderLines.get(result.order.id)?.[0].orderedMT, "55.00");
  assert.deepEqual(mock.getCreateCounts(), { partyCreates: 1, siteCreates: 1 });
});

test("links existing party and site by case-insensitive names without duplicates", async () => {
  const existingParty = {
    id: "existing-party",
    partyName: "HIGH LANE",
    partyCode: "HLC",
    sitePulsePartyId: null,
  } as Party;
  const existingSite = {
    id: "existing-site",
    partyId: "existing-party",
    siteName: "north yard",
    siteCode: "HLC-NY",
    sitePulseSiteId: null,
  } as Site;
  const mock = mockStorage(existingParty, existingSite);
  const result = await receiveSitePulseOrder(sitePulseOrderSchema.parse(baseOrder), mock.storage, () => "unused");
  assert.equal(result.party.id, existingParty.id);
  assert.equal(result.site.id, existingSite.id);
  assert.equal(result.party.sitePulsePartyId, "party-ext-1");
  assert.equal(result.site.sitePulseSiteId, "site-ext-1");
  assert.deepEqual(mock.getCreateCounts(), { partyCreates: 0, siteCreates: 0 });
});

test("received quantity counts only matching mix arrivals within the order period", () => {
  const periodFrom = new Date("2026-11-01T00:00:00.000Z");
  const periodTo = new Date("2026-11-30T23:59:59.999Z");
  const dispatches = [
    { status: "ARRIVED", arrivedAt: new Date("2026-11-10T12:00:00.000Z"), mixType: "DBM", loadMT: "12.5" },
    { status: "UNLOADED", arrivedAt: new Date("2026-11-15T12:00:00.000Z"), mixType: "dbm", loadMT: "8" },
    { status: "DISPATCHED", arrivedAt: null, mixType: "DBM", loadMT: "50" },
    { status: "ARRIVED", arrivedAt: new Date("2026-12-01T00:00:00.000Z"), mixType: "DBM", loadMT: "20" },
    { status: "ARRIVED", arrivedAt: new Date("2026-11-12T12:00:00.000Z"), mixType: "BC", loadMT: "9" },
  ] as any[];
  assert.equal(calculateSitePulseOrderReceivedMT(" DBM ", periodFrom, periodTo, dispatches as any), 20.5);
});
