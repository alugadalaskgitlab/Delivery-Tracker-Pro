import { z } from "zod";
import type { Dispatch, Party, Site, SitePulseOrder } from "@shared/schema";
import type { IStorage } from "./storage";

const dateValue = (isEnd: boolean) => z.string().trim().min(1).refine(
  (value) => !Number.isNaN(Date.parse(value)),
  "must be a valid date",
).transform((value) => {
  const date = new Date(value);
  if (isEnd && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
});

export const sitePulseOrderSchema = z.object({
  sitePulseOrderId: z.string().trim().min(1).max(200),
  partyName: z.string().trim().min(1).max(200),
  partyDetails: z.object({
    address: z.string().trim().max(300).optional(),
    gstNo: z.string().trim().max(100).optional(),
    panNo: z.string().trim().max(100).optional(),
    contactPerson: z.string().trim().max(100).optional(),
    mobile: z.string().trim().max(100).optional(),
  }).strict().optional(),
  sitePulsePartyId: z.string().trim().min(1).max(200),
  siteName: z.string().trim().min(1).max(200),
  sitePulseSiteId: z.string().trim().min(1).max(200),
  orderNumber: z.string().trim().min(1).max(200),
  mixLines: z.array(z.object({
    mix: z.string().trim().min(1).max(100),
    orderedMT: z.coerce.number().positive().finite(),
  }).strict()).min(1),
  periodFrom: dateValue(false),
  periodTo: dateValue(true),
  status: z.preprocess(
    (value) => typeof value === "string" ? value.toLowerCase() : value,
    z.enum(["open", "closed"]).transform((value) => value.toUpperCase()),
  ),
}).strict().refine((value) => value.periodFrom <= value.periodTo, {
  path: ["periodTo"],
  message: "must be on or after periodFrom",
});

export type SitePulseOrderInput = z.infer<typeof sitePulseOrderSchema>;

export function formatSitePulseOrderError(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path.map(String).join(".");
  if (issue?.code === "unrecognized_keys") {
    return `Unexpected field${issue.keys.length === 1 ? "" : "s"}: ${issue.keys.join(", ")}`;
  }
  if (field) return `${field} ${issue.message}`;
  return issue?.message || "Invalid request";
}

type SitePulseOrderStorage = Pick<IStorage,
  | "getParties"
  | "getAllSites"
  | "createParty"
  | "updateParty"
  | "createSite"
  | "updateSite"
  | "generatePartyCode"
  | "generateSiteCode"
  | "upsertSitePulseOrder"
>;

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function calculateSitePulseOrderReceivedMT(
  mix: string,
  periodFrom: Date,
  periodTo: Date,
  dispatches: Dispatch[],
): number {
  const normalizedMix = normalizedName(mix);
  return dispatches
    .filter((dispatch) =>
      (dispatch.status === "ARRIVED" || dispatch.status === "UNLOADED")
      && dispatch.arrivedAt !== null
      && dispatch.arrivedAt !== undefined
      && dispatch.arrivedAt >= periodFrom
      && dispatch.arrivedAt <= periodTo
      && normalizedName(dispatch.mixType || "") === normalizedMix,
    )
    .reduce((total, dispatch) => total + Number(dispatch.loadMT), 0);
}

export async function receiveSitePulseOrder(
  input: SitePulseOrderInput,
  storage: SitePulseOrderStorage,
  createAccessId: () => string,
): Promise<{ party: Party; site: Site; order: SitePulseOrder }> {
  const allParties = await storage.getParties();
  const idParty = allParties.find((party) => party.sitePulsePartyId === input.sitePulsePartyId);
  const namePartyMatches = allParties.filter((party) => normalizedName(party.partyName) === normalizedName(input.partyName));
  if (!idParty && namePartyMatches.length > 1) {
    throw new Error("partyName matches more than one DispatchPro party");
  }
  let party = idParty || namePartyMatches[0];
  if (!party) {
    party = await storage.createParty({
      partyName: input.partyName,
      partyCode: await storage.generatePartyCode(input.partyName),
      address: nonBlankPartyDetail(input.partyDetails?.address) ?? null,
      gstNo: nonBlankPartyDetail(input.partyDetails?.gstNo) ?? null,
      panNo: nonBlankPartyDetail(input.partyDetails?.panNo) ?? null,
      contactPerson: nonBlankPartyDetail(input.partyDetails?.contactPerson) ?? null,
      mobile: nonBlankPartyDetail(input.partyDetails?.mobile) ?? null,
      status: "ACTIVE",
      accessId: createAccessId(),
      sitePulsePartyId: input.sitePulsePartyId,
      createdBy: null,
    });
  } else if (party.sitePulsePartyId && party.sitePulsePartyId !== input.sitePulsePartyId) {
    throw new Error("sitePulsePartyId is already linked to a different party");
  } else {
    const changes: Partial<Party> = {};
    if (!party.sitePulsePartyId) changes.sitePulsePartyId = input.sitePulsePartyId;
    for (const field of ["address", "gstNo", "panNo", "contactPerson", "mobile"] as const) {
      const value = input.partyDetails?.[field]?.trim();
      if (value) changes[field] = value;
    }
    if (Object.keys(changes).length > 0) {
      party = (await storage.updateParty(party.id, changes)) || party;
    }
  }

  const allSites = await storage.getAllSites();
  const partySites = allSites.filter((site) => site.partyId === party!.id);
  const idSite = partySites.find((site) => site.sitePulseSiteId === input.sitePulseSiteId);
  const nameSiteMatches = partySites.filter((site) => normalizedName(site.siteName) === normalizedName(input.siteName));
  if (!idSite && nameSiteMatches.length > 1) {
    throw new Error("siteName matches more than one DispatchPro site for this party");
  }
  let site = idSite || nameSiteMatches[0];
  if (!site) {
    const totalOrderedMT = input.mixLines.reduce((total, line) => total + line.orderedMT, 0);
    site = await storage.createSite({
      partyId: party.id,
      siteCode: await storage.generateSiteCode(party.partyCode, input.siteName),
      siteName: input.siteName,
      mixType: input.mixLines[0].mix,
      orderedMT: totalOrderedMT.toFixed(2),
      accessId: createAccessId(),
      status: "ACTIVE",
      notifyMobile: null,
      sitePulseSiteId: input.sitePulseSiteId,
    });
  } else if (site.sitePulseSiteId && site.sitePulseSiteId !== input.sitePulseSiteId) {
    throw new Error("sitePulseSiteId is already linked to a different site");
  } else if (!site.sitePulseSiteId) {
    site = (await storage.updateSite(site.id, { sitePulseSiteId: input.sitePulseSiteId })) || site;
  }

  const order = await storage.upsertSitePulseOrder({
    sitePulseOrderId: input.sitePulseOrderId,
    siteId: site.id,
    orderNumber: input.orderNumber,
    periodFrom: input.periodFrom,
    periodTo: input.periodTo,
    status: input.status,
  }, input.mixLines.map((line) => ({
    mix: line.mix,
    orderedMT: line.orderedMT.toFixed(2),
  })));

  return { party, site, order };
}

function nonBlankPartyDetail(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.trim() ? value.trim() : null;
}
