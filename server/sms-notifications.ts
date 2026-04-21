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

export function triggerSiteNotification(payload: SmsNotificationPayload): void {
  const numbers = payload.notifyMobile
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);

  if (numbers.length === 0) return;

  for (const number of numbers) {
    console.log(
      `[SMS-HOOK] Event: ${payload.event} | To: ${number} | Challan: ${payload.challanNo} | Site: ${payload.siteName} | Vehicle: ${payload.vehicleNo} | Load: ${payload.loadMT} MT | Driver: ${payload.driverName || "N/A"} (${payload.driverMobile || "N/A"}) | Time: ${payload.timestamp.toISOString()}`
    );
  }
}
