import { useState, useEffect } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isNotificationSupported,
  isIOSNeedsPWA,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSubscribed,
  registerServiceWorker,
} from "@/lib/push-notifications";
import { useToast } from "@/hooks/use-toast";

interface NotificationToggleProps {
  role?: string;
  siteId?: string;
}

export function NotificationToggle({ role, siteId }: NotificationToggleProps) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const { toast } = useToast();

  useEffect(() => {
    async function checkStatus() {
      if (!isNotificationSupported()) {
        setLoading(false);
        return;
      }
      await registerServiceWorker();
      setPermission(getNotificationPermission());
      const sub = await isPushSubscribed();
      setSubscribed(sub);
      setLoading(false);
    }
    checkStatus();
  }, []);

  const iosNeedsPWA = isIOSNeedsPWA();

  if (!isNotificationSupported() && !iosNeedsPWA) {
    return null;
  }

  async function handleToggle() {
    if (iosNeedsPWA) {
      toast({
        title: "Add to Home Screen",
        description: "To receive notifications on iPhone, tap the Share button (⬆) in Safari, then 'Add to Home Screen'. Open the app from there.",
        duration: 8000,
      });
      return;
    }
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
          const perm = getNotificationPermission();
          setPermission(perm);
          if (perm === "denied") {
            toast({
              title: "Notifications blocked",
              description: "Please enable notifications in your browser/device settings, then try again",
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
    } catch (error) {
      toast({ title: "Error", description: "Failed to update notification settings", variant: "destructive" });
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <Button variant="ghost" size="icon" disabled data-testid="button-notifications-loading">
        <Bell className="h-5 w-5 animate-pulse" />
      </Button>
    );
  }

  if (permission === "denied") {
    return (
      <Button variant="ghost" size="icon" disabled title="Notifications blocked in browser settings" data-testid="button-notifications-denied">
        <BellOff className="h-5 w-5 text-muted-foreground" />
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      title={subscribed ? "Disable notifications" : "Enable notifications"}
      data-testid="button-notifications-toggle"
    >
      {subscribed ? (
        <BellRing className="h-5 w-5 text-green-500" />
      ) : (
        <Bell className="h-5 w-5" />
      )}
    </Button>
  );
}
