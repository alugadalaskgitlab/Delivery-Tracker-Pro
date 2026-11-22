import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Check, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  isNotificationSupported,
  isIOSNeedsPWA,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  registerServiceWorker,
} from "@/lib/push-notifications";
import { getAlertPresentation } from "@/lib/notification-state";
import { useToast } from "@/hooks/use-toast";

interface NotificationToggleProps {
  role?: string;
  siteId?: string;
  variant?: "prominent" | "compact";
}

export function NotificationToggle({ role, siteId, variant = "compact" }: NotificationToggleProps) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const { toast } = useToast();
  const needsPwa = isIOSNeedsPWA();
  const supported = isNotificationSupported();
  const presentation = getAlertPresentation({ loading, subscribed, permission, needsPwa, supported });

  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      const currentPermission = getNotificationPermission();
      if (supported) await registerServiceWorker();
      const active = supported ? await isPushSubscribed(role, siteId) : false;
      if (cancelled) return;
      setPermission(currentPermission);
      setSubscribed(active);
      setLoading(false);
    }
    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [role, siteId, supported]);

  async function handleToggle() {
    if (needsPwa) return;
    setLoading(true);
    try {
      if (subscribed) {
        const success = await unsubscribeFromPush();
        if (success) {
          setSubscribed(false);
          toast({ title: "Notifications disabled" });
        } else {
          toast({ title: "Error", description: "Failed to disable notifications", variant: "destructive" });
        }
      } else {
        const success = await subscribeToPush(role, siteId);
        if (success) {
          setSubscribed(true);
          setPermission("granted");
          toast({ title: "Notifications enabled", description: "You'll receive alerts for dispatches and status changes" });
        } else {
          const nextPermission = getNotificationPermission();
          setPermission(nextPermission);
          if (nextPermission === "denied") {
            toast({
              title: "Notifications blocked",
              description: "Open phone Settings → Notifications → allow for this app/site, then come back.",
              variant: "destructive",
            });
          } else {
            toast({
              title: "Could not enable notifications",
              description: "Please check your browser supports push notifications and try again",
              variant: "destructive",
            });
          }
        }
      }
    } catch {
      toast({ title: "Error", description: "Failed to update notification settings", variant: "destructive" });
    }
    setLoading(false);
  }

  if (presentation === "hidden") return null;

  const prominent = variant === "prominent";
  const compactCardClass = prominent ? "border-blue-200 bg-blue-50" : "border-amber-200 bg-amber-50";

  return (
    <section className={prominent ? "w-full space-y-2" : "w-full"} aria-live="polite">
      <div className="flex min-h-9 items-center justify-end gap-2">
        {presentation === "active" && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700" data-testid="alerts-on">
            Alerts on <Check className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          disabled={loading || presentation === "blocked" || presentation === "ios-install"}
          title={subscribed ? "Disable notifications" : "Enable notifications"}
          aria-label={subscribed ? "Disable dispatch alerts" : "Enable dispatch alerts"}
          data-testid={loading ? "button-notifications-loading" : "button-notifications-toggle"}
        >
          {presentation === "blocked" ? (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          ) : subscribed ? (
            <BellRing className="h-5 w-5 text-green-600" />
          ) : (
            <Bell className={`h-5 w-5 ${loading ? "animate-pulse" : ""}`} />
          )}
        </Button>
      </div>

      {(presentation === "prompt" || presentation === "blocked" || presentation === "ios-install" || presentation === "loading") && (
        <Card className={compactCardClass} data-testid={`alerts-card-${presentation}`}>
          <CardContent className={prominent ? "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between" : "flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"}>
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 rounded-full p-2 ${presentation === "blocked" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                {presentation === "blocked" ? <BellOff className="h-5 w-5" /> : <BellRing className="h-5 w-5" />}
              </span>
              <div className="space-y-1">
                <h2 className={prominent ? "font-semibold text-gray-900" : "text-sm font-semibold text-gray-900"}>
                  {presentation === "blocked" ? "Dispatch alerts are blocked" : "Turn on dispatch alerts"}
                </h2>
                {presentation === "blocked" ? (
                  <p className="text-sm leading-5 text-gray-700">
                    Alerts are blocked on this phone. Open phone Settings → Notifications → allow for this app/site, then come back.
                  </p>
                ) : presentation === "ios-install" ? (
                  <div className="text-sm leading-5 text-gray-700">
                    <p>On iPhone, first add this site to your Home Screen:</p>
                    <p className="mt-1 flex items-center gap-1">
                      Tap Share <Share2 className="inline h-4 w-4" aria-label="Share icon" /> in Safari, then tap “Add to Home Screen”. Open the site from its new icon to turn on alerts.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm leading-5 text-gray-700">
                    Get a message on this phone the moment a truck leaves the plant.
                  </p>
                )}
              </div>
            </div>
            {(presentation === "prompt" || presentation === "loading") && (
              <Button
                onClick={handleToggle}
                disabled={loading}
                className={prominent ? "w-full shrink-0 sm:w-auto" : "w-full shrink-0 sm:w-auto"}
                data-testid="button-turn-on-alerts"
              >
                {loading ? "Checking alerts…" : "Turn on alerts"}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  );
}
