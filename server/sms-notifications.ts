import twilio from "twilio";
import { storage } from "./storage";

export type SmsEvent = "DISPATCHED" | "ARRIVED" | "UNLOADED";

export interface SmsNotificationPayload {
  event: SmsEvent;
  challanNo: string;
  siteName: string;
  vehicleNo: string;
  driverName?: string | null;
  driverMobile?: string | null;
  loadMT: string;
  notifyMobile: string;
  timestamp: Date;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

function buildMessage(payload: SmsNotificationPayload): string {
  const statusLabel: Record<SmsEvent, string> = {
    DISPATCHED: "Dispatched",
    ARRIVED: "Arrived at site",
    UNLOADED: "Unloaded",
  };

  const timeStr = payload.timestamp.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return (
    `[${statusLabel[payload.event]}] Challan: ${payload.challanNo} | ` +
    `Vehicle: ${payload.vehicleNo} | Load: ${payload.loadMT} MT | ` +
    `Site: ${payload.siteName} | Time: ${timeStr}`
  );
}

/**
 * Normalize a phone number for Twilio delivery.
 *
 * - WhatsApp numbers (prefixed with "whatsapp:") are passed through unchanged.
 * - Numbers already in E.164 format (starts with "+") are passed through.
 * - 10-digit Indian mobile numbers (e.g. 9876543210) get a "+91" prefix.
 * - Numbers starting with "0" have the leading zero replaced with "+91".
 * - Anything else is passed through as-is (Twilio will surface an error).
 *
 * Digits-only stripping of spaces/hyphens happens before all checks.
 */
export function normalizePhoneNumber(raw: string): string {
  if (raw.startsWith("whatsapp:")) return raw;

  const stripped = raw.replace(/[\s\-().]/g, "");

  if (stripped.startsWith("+")) return stripped;

  if (stripped.startsWith("0") && stripped.length === 11) {
    return "+91" + stripped.slice(1);
  }

  if (/^\d{10}$/.test(stripped)) {
    return "+91" + stripped;
  }

  return stripped;
}

/**
 * Resolve Twilio credentials: DB-stored values take priority over env vars.
 */
export async function resolveCredentials(): Promise<TwilioCredentials | null> {
  const [dbSid, dbToken, dbFrom] = await Promise.all([
    storage.getSetting("twilio_account_sid"),
    storage.getSetting("twilio_auth_token"),
    storage.getSetting("twilio_from_number"),
  ]);

  const accountSid = dbSid || process.env.TWILIO_ACCOUNT_SID;
  const authToken = dbToken || process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = dbFrom || process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !authToken || !fromNumber) return null;

  return { accountSid, authToken, fromNumber };
}

function buildTwilioClient(accountSid: string, authToken: string): ReturnType<typeof twilio> {
  return twilio(accountSid, authToken);
}

async function sendViaTwilio(
  client: ReturnType<typeof twilio>,
  from: string,
  to: string,
  body: string
): Promise<void> {
  const msg = await client.messages.create({ from, to, body });
  console.log(`[SMS] Sent to ${to} (SID: ${msg.sid})`);
}

export async function triggerSiteNotification(payload: SmsNotificationPayload): Promise<void> {
  const numbers = payload.notifyMobile
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (numbers.length === 0) return;

  const body = buildMessage(payload);
  const creds = await resolveCredentials();

  if (!creds) {
    for (const number of numbers) {
      console.log(
        `[SMS-HOOK] Event: ${payload.event} | To: ${number} | Challan: ${payload.challanNo} | Site: ${payload.siteName} | Vehicle: ${payload.vehicleNo} | Load: ${payload.loadMT} MT | Driver: ${payload.driverName || "N/A"} (${payload.driverMobile || "N/A"}) | Time: ${payload.timestamp.toISOString()}`
      );
    }
    return;
  }

  const client = buildTwilioClient(creds.accountSid, creds.authToken);

  for (const number of numbers) {
    const normalized = normalizePhoneNumber(number);
    sendViaTwilio(client, creds.fromNumber, normalized, body).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[SMS] Failed to send to ${normalized}: ${message}`);
    });
  }
}

/**
 * Send a single test SMS using explicit credentials.
 * Returns an object with success status and a message/SID.
 */
export async function sendTestSms(
  creds: TwilioCredentials,
  toNumber: string
): Promise<{ success: boolean; message: string }> {
  const normalized = normalizePhoneNumber(toNumber);
  const body =
    "[DispatchPro Test] SMS configuration is working correctly. You can now receive dispatch notifications.";

  try {
    const client = buildTwilioClient(creds.accountSid, creds.authToken);
    const msg = await client.messages.create({
      from: creds.fromNumber,
      to: normalized,
      body,
    });
    return { success: true, message: `Message sent successfully (SID: ${msg.sid})` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}
