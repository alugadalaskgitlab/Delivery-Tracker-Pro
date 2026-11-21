import { and, asc, eq, isNull, lte } from "drizzle-orm";
import { db } from "../db";
import { sitePulseStatusOutbox } from "@shared/schema";

let workerStarted = false;
let processing = false;

export async function enqueueSitePulseStatus(input: {
  externalRef: string;
  challanNo: string;
  status: "ARRIVED" | "LEFT";
  at: Date;
  byName: string;
}) {
  await db.insert(sitePulseStatusOutbox).values({
    ...input,
    nextAttemptAt: new Date(),
  });
}

async function deliverPendingStatuses() {
  if (processing) return;
  processing = true;

  try {
    const now = new Date();
    const expired = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const expiredRows = await db
      .select({ id: sitePulseStatusOutbox.id })
      .from(sitePulseStatusOutbox)
      .where(and(
        eq(sitePulseStatusOutbox.deliveryStatus, "PENDING"),
        isNull(sitePulseStatusOutbox.sentAt),
        lte(sitePulseStatusOutbox.createdAt, expired),
      ));

    for (const row of expiredRows) {
      await db.update(sitePulseStatusOutbox)
        .set({ deliveryStatus: "FAILED", lastError: "Retry window expired" })
        .where(eq(sitePulseStatusOutbox.id, row.id));
    }

    const pending = await db
      .select()
      .from(sitePulseStatusOutbox)
      .where(and(
        eq(sitePulseStatusOutbox.deliveryStatus, "PENDING"),
        isNull(sitePulseStatusOutbox.sentAt),
        lte(sitePulseStatusOutbox.nextAttemptAt, now),
      ))
      .orderBy(asc(sitePulseStatusOutbox.createdAt))
      .limit(20);

    for (const item of pending) {
      try {
        const baseUrl = process.env.SITEPULSE_BASE_URL;
        const secret = process.env.SITEPULSE_SHARED_SECRET;
        if (!baseUrl || !secret) throw new Error("SitePulse callback configuration is missing");

        const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/integrations/dispatchpro/status`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-SitePulse-Key": secret,
          },
          body: JSON.stringify({
            externalRef: item.externalRef,
            challanNo: item.challanNo,
            status: item.status,
            at: item.at.toISOString(),
            byName: item.byName,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) throw new Error(`SitePulse returned HTTP ${response.status}`);

        await db.update(sitePulseStatusOutbox)
          .set({ deliveryStatus: "SENT", sentAt: new Date(), lastError: null })
          .where(eq(sitePulseStatusOutbox.id, item.id));
      } catch (error) {
        const attempts = item.attempts + 1;
        const ageMs = Date.now() - item.createdAt.getTime();
        const exhausted = ageMs >= 24 * 60 * 60 * 1000;
        const delayMs = Math.min(60 * 60 * 1000, 30_000 * (2 ** Math.min(attempts - 1, 7)));
        await db.update(sitePulseStatusOutbox)
          .set({
            attempts,
            nextAttemptAt: new Date(Date.now() + delayMs),
            lastError: error instanceof Error ? error.message.slice(0, 500) : "Unknown callback error",
            ...(exhausted ? { deliveryStatus: "FAILED" } : {}),
          })
          .where(eq(sitePulseStatusOutbox.id, item.id));
      }
    }
  } catch (error) {
    console.error("[SitePulse outbox] Poll failed:", error instanceof Error ? error.message : "Unknown error");
  } finally {
    processing = false;
  }
}

export function startSitePulseOutboxWorker() {
  if (workerStarted) return;
  workerStarted = true;
  const run = () => {
    if (!process.env.SITEPULSE_SHARED_SECRET || !process.env.SITEPULSE_BASE_URL) return;
    void deliverPendingStatuses();
  };
  setTimeout(run, 5_000);
  setInterval(run, 15_000).unref();
}
