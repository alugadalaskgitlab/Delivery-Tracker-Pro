import { z } from "zod";
import type { Dispatch, Party, Site } from "@shared/schema";
import type { IStorage } from "./storage";
import type { sendSiteNotification } from "./push-notifications";
import type { triggerSiteNotification } from "./sms-notifications";

const optionalText = (maxLength: number, trim = false) => z.preprocess(
  (value) => value === null || (typeof value === "string" && value.trim() === "") ? undefined : value,
  (trim ? z.string().trim() : z.string()).max(maxLength).optional(),
);

export const sitePulseCreateDispatchSchema = z.object({
  externalRef: z.string().trim().min(1).max(200),
  siteId: z.string().min(1),
  vehicleNo: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()),
  loadMT: z.coerce.number().positive().finite(),
  driverName: optionalText(200, true),
  driverMobile: optionalText(50, true),
  notes: optionalText(2000),
  mixType: optionalText(100, true),
}).strict();

export const sitePulseUpdateDispatchSchema = z.object({
  externalRef: z.string().trim().min(1).optional(),
  siteId: z.string().min(1).optional(),
  vehicleNo: z.string().trim().min(1).max(100).transform((value) => value.toUpperCase()).optional(),
  loadMT: z.coerce.number().positive().finite().optional(),
  driverName: optionalText(200, true),
  driverMobile: optionalText(50, true),
  notes: optionalText(2000),
  mixType: optionalText(100, true),
}).strict().refine(
  (value) => [value.vehicleNo, value.loadMT, value.driverName, value.driverMobile, value.notes, value.mixType]
    .some((field) => field !== undefined),
  "At least one editable field is required",
);

export function formatSitePulseValidationError(error: z.ZodError): string {
  const issue = error.issues[0];
  const field = issue?.path[0];
  if (issue?.code === "unrecognized_keys") {
    return `Unexpected field${issue.keys.length === 1 ? "" : "s"}: ${issue.keys.join(", ")}`;
  }
  if (field) {
    if (issue.code === "invalid_type" && (issue.received === "undefined" || issue.received === "null")) {
      return `${String(field)} is missing`;
    }
    return `${String(field)} is invalid`;
  }
  return issue?.message || "Invalid request";
}

export function validateSitePulseDispatchUpdate(
  body: unknown,
  pathExternalRef: string,
  dispatch: Pick<Dispatch, "siteId">,
): { success: true; changes: Partial<Dispatch> } | { success: false; error: string } {
  const parsed = sitePulseUpdateDispatchSchema.safeParse(body);
  if (!parsed.success) return { success: false, error: formatSitePulseValidationError(parsed.error) };
  if (parsed.data.externalRef !== undefined && parsed.data.externalRef !== pathExternalRef) {
    return { success: false, error: "Reference does not match this trip" };
  }
  if (parsed.data.siteId !== undefined && parsed.data.siteId !== dispatch.siteId) {
    return { success: false, error: "Site can't be changed after dispatch. Cancel this trip and send a new one." };
  }

  const changes: Partial<Dispatch> = {};
  if (parsed.data.vehicleNo !== undefined) changes.vehicleNo = parsed.data.vehicleNo;
  if (parsed.data.loadMT !== undefined) changes.loadMT = String(parsed.data.loadMT);
  if (parsed.data.driverName !== undefined) changes.driverName = parsed.data.driverName;
  if (parsed.data.driverMobile !== undefined) changes.driverMobile = parsed.data.driverMobile;
  if (parsed.data.notes !== undefined) changes.notes = parsed.data.notes;
  if (parsed.data.mixType !== undefined) changes.mixType = parsed.data.mixType;
  return { success: true, changes };
}

type CreationStorage = Pick<IStorage, "incrementChallanSequence" | "createDispatch">;

export async function createDispatchAndNotify(input: {
  party: Party;
  site: Site;
  vehicleNo: string;
  loadMT: string | number;
  notes?: string | null;
  driverName?: string | null;
  driverMobile?: string | null;
  mixType?: string | null;
  externalRef?: string;
  externalSource?: string;
}, dependencies: {
  storage: CreationStorage;
  emitNewDispatch: (payload: unknown) => void;
  sendSiteNotification: typeof sendSiteNotification;
  triggerSiteNotification: typeof triggerSiteNotification;
}): Promise<Dispatch> {
  const { party, site, vehicleNo, loadMT, notes, driverName, driverMobile } = input;
  const normalizedVehicleNo = vehicleNo.toUpperCase();
  const normalizedDriverName = driverName?.trim() || null;
  const normalizedDriverMobile = driverMobile?.trim() || null;
  const nextSeq = await dependencies.storage.incrementChallanSequence(site.id);
  const challanNo = `${site.siteCode}-${String(nextSeq).padStart(4, "0")}`;

  const dispatch = await dependencies.storage.createDispatch({
    challanNo,
    partyId: party.id,
    partyName: party.partyName,
    partyCode: party.partyCode,
    siteId: site.id,
    siteCode: site.siteCode,
    siteName: site.siteName,
    mixType: input.mixType || site.mixType,
    vehicleNo: normalizedVehicleNo,
    driverName: normalizedDriverName,
    driverMobile: normalizedDriverMobile,
    loadMT: String(loadMT),
    status: "DISPATCHED",
    notes: notes?.toUpperCase() || null,
    createdBy: null,
    externalRef: input.externalRef ?? null,
    externalSource: input.externalSource ?? null,
  });

  dependencies.emitNewDispatch({
    dispatch,
    partyName: party.partyName,
    partyCode: party.partyCode,
    siteName: site.siteName,
  });

  dependencies.sendSiteNotification(site.id, {
    title: "🚛 New Dispatch Created",
    body: `${challanNo} - ${loadMT} MT to ${site.siteName}`,
    tag: `dispatch-${dispatch.id}`,
    data: { type: "new-dispatch", dispatchId: dispatch.id, url: `/site/${site.accessId}` },
  }).catch((err) => console.error("Push notification error:", err));

  if (site.notifyMobile) {
    dependencies.triggerSiteNotification({
      event: "DISPATCHED",
      challanNo,
      siteName: site.siteName,
      vehicleNo: normalizedVehicleNo,
      driverName: normalizedDriverName,
      driverMobile: normalizedDriverMobile,
      loadMT: String(loadMT),
      notifyMobile: site.notifyMobile,
      timestamp: new Date(),
    }).catch((err) => console.error("[SMS] Dispatch notification error:", err));
  }

  return dispatch;
}
