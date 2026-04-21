import twilio from "twilio";

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
function normalizePhoneNumber(raw: string): string {
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

function getTwilioClient(): ReturnType<typeof twilio> | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) return null;

  return twilio(accountSid, authToken);
}

async function sendViaTwilio(
  client: ReturnType<typeof twilio>,
  from: string,
  to: string,
  body: string
): Promise<void> {
  try {
    const msg = await client.messages.create({ from, to, body });
    console.log(`[SMS] Sent to ${to} (SID: ${msg.sid})`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[SMS] Failed to send to ${to}: ${message}`);
  }
}

export function triggerSiteNotification(payload: SmsNotificationPayload): void {
  const numbers = payload.notifyMobile
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (numbers.length === 0) return;

  const from = process.env.TWILIO_FROM_NUMBER;
  const client = getTwilioClient();

  const body = buildMessage(payload);

  if (!client || !from) {
    for (const number of numbers) {
      console.log(
        `[SMS-HOOK] Event: ${payload.event} | To: ${number} | Challan: ${payload.challanNo} | Site: ${payload.siteName} | Vehicle: ${payload.vehicleNo} | Load: ${payload.loadMT} MT | Driver: ${payload.driverName || "N/A"} (${payload.driverMobile || "N/A"}) | Time: ${payload.timestamp.toISOString()}`
      );
    }
    return;
  }

  for (const number of numbers) {
    const normalized = normalizePhoneNumber(number);
    sendViaTwilio(client, from, normalized, body).catch((err) => {
      console.error(`[SMS] Unexpected error for ${normalized}:`, err);
    });
  }
}
