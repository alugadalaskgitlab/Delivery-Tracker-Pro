import { timingSafeEqual } from "crypto";
import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 120;
const requestsByClient = new Map<string, { count: number; windowStartedAt: number }>();

function safeSecretMatch(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  return providedBytes.length === expectedBytes.length && timingSafeEqual(providedBytes, expectedBytes);
}

export function requireSitePulseKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.SITEPULSE_SHARED_SECRET;
  const provided = req.get("X-SitePulse-Key") || "";

  if (!expected || !provided || !safeSecretMatch(provided, expected)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

export function limitSitePulseRequests(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const client = req.ip || req.socket.remoteAddress || "unknown";
  const current = requestsByClient.get(client);

  if (!current || now - current.windowStartedAt >= WINDOW_MS) {
    requestsByClient.set(client, { count: 1, windowStartedAt: now });
    return next();
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader("Retry-After", String(Math.ceil((current.windowStartedAt + WINDOW_MS - now) / 1000)));
    return res.status(429).json({ error: "Too many requests" });
  }

  current.count += 1;
  next();
}

export function auditSitePulseCall(req: Request, res: Response, next: NextFunction) {
  res.on("finish", () => {
    const bodyExternalRef = typeof req.body?.externalRef === "string" ? req.body.externalRef : "";
    const pathExternalRef = typeof req.params?.externalRef === "string" ? req.params.externalRef : "";
    const externalRef = (bodyExternalRef || pathExternalRef).replace(/[\r\n]/g, "").slice(0, 200) || "-";
    console.info(
      `[SitePulse integration] ${new Date().toISOString()} ${req.method} ${req.path} externalRef=${externalRef} result=${res.statusCode}`,
    );
  });
  next();
}
