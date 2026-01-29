import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { Check, Clock, PackageCheck, ShieldAlert, Truck } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type DispatchStatus = "DISPATCHED" | "ARRIVED" | "LEFT";

type PartyStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

type Dispatch = {
  id: string;
  challanNo: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string;
  siteName: string;
  vehicleNo: string;
  loadMT: number;
  createdAt: number;
  status: DispatchStatus;
  arrivedAt?: number;
  leftAt?: number;
  receivedMT?: number;
  arrivedByName?: string;
  leftByName?: string;
};

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string;
  totalRequiredMT: number;
  status: PartyStatus;
  accessId: string;
};

type NotificationEvent = {
  id: string;
  ts: number;
  side: "ADMIN" | "SITE";
  title: string;
  message: string;
  dispatchId?: string;
  partyId?: string;
};

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clampNum(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

function beep() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    const ctx = new AudioCtx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = 740;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.10, ctx.currentTime + 0.01);
    o.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.16);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.36);
    o.stop(ctx.currentTime + 0.38);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // ignore
  }
}

function notifyBrowser(title: string, body: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    // eslint-disable-next-line no-new
    new Notification(title, { body, silent: false });
  } catch {
    // ignore
  }
}

function pushNotification(
  side: "ADMIN" | "SITE",
  title: string,
  message: string,
  prev: NotificationEvent[],
  meta?: Partial<Pick<NotificationEvent, "dispatchId" | "partyId">>,
) {
  const entry: NotificationEvent = {
    id: uid("notif"),
    ts: Date.now(),
    side,
    title,
    message,
    dispatchId: meta?.dispatchId,
    partyId: meta?.partyId,
  };

  const next = [entry, ...prev].slice(0, 200);
  localStorage.setItem("df_notifications_v2", JSON.stringify(next));

  if (side === "SITE") {
    toast(title, { description: message });
  }

  beep();
  notifyBrowser(title, message);

  try {
    window.dispatchEvent(new CustomEvent("df:notify", { detail: entry }));
  } catch {
    // ignore
  }

  return next;
}

function loadState() {
  const partiesKey = "df_parties_v2";
  const dispatchesKey = "df_dispatches_v2";
  const notifsKey = "df_notifications_v2";

  const parties = (JSON.parse(localStorage.getItem(partiesKey) || "null") as Party[] | null) ?? [];
  const dispatches = (JSON.parse(localStorage.getItem(dispatchesKey) || "null") as Dispatch[] | null) ?? [];
  const notifications = (JSON.parse(localStorage.getItem(notifsKey) || "null") as NotificationEvent[] | null) ?? [];

  return { parties, dispatches, notifications };
}

function saveDispatches(dispatches: Dispatch[]) {
  localStorage.setItem("df_dispatches_v2", JSON.stringify(dispatches));
}

function statusBadge(status: DispatchStatus) {
  if (status === "DISPATCHED") {
    return (
      <Badge data-testid="badge-status-dispatched" className="bg-primary/10 text-primary border-primary/20">
        DISPATCHED
      </Badge>
    );
  }
  if (status === "ARRIVED") {
    return (
      <Badge data-testid="badge-status-arrived" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
        ARRIVED
      </Badge>
    );
  }
  return (
    <Badge data-testid="badge-status-left" className="bg-slate-500/10 text-slate-700 border-slate-500/20">
      LEFT
    </Badge>
  );
}

export default function SiteDispatch() {
  const [, params] = useRoute("/site/:accessId");
  const [, setLocation] = useLocation();

  const accessId = params?.accessId ?? "";

  const [{ parties: initialParties, dispatches: initialDispatches, notifications: initialNotifications }] = useState(() =>
    loadState(),
  );
  const [parties, setParties] = useState<Party[]>(initialParties);
  const [dispatches, setDispatches] = useState<Dispatch[]>(initialDispatches);
  const [notifications, setNotifications] = useState<NotificationEvent[]>(initialNotifications);

  const party = useMemo(() => parties.find((p) => p.accessId === accessId), [parties, accessId]);
  const partyDispatches = useMemo(
    () =>
      dispatches
        .filter((d) => d.partyId === party?.id)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt),
    [dispatches, party?.id],
  );

  const active = useMemo(() => partyDispatches.find((d) => d.status !== "LEFT") ?? null, [partyDispatches]);

  const [arrivedName, setArrivedName] = useState("");
  const [receivedMT, setReceivedMT] = useState("");
  const [leftName, setLeftName] = useState("");

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === "df_parties_v2" || e.key === "df_dispatches_v2" || e.key === "df_notifications_v2") {
        const s = loadState();
        setParties(s.parties);
        setDispatches(s.dispatches);
        setNotifications(s.notifications);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function persist(nextDispatches: Dispatch[], nextNotifs: NotificationEvent[]) {
    setDispatches(nextDispatches);
    setNotifications(nextNotifs);
    saveDispatches(nextDispatches);
    localStorage.setItem("df_notifications_v2", JSON.stringify(nextNotifs));
  }

  function acknowledgeArrived() {
    if (!party) return;
    if (party.status !== "ACTIVE") return;
    if (!active) return;
    if (active.status !== "DISPATCHED") return;

    const name = arrivedName.trim();
    const qty = clampNum(receivedMT);
    if (!name) {
      toast("Name required", { description: "Please enter your name to confirm arrival." });
      return;
    }
    if (qty <= 0) {
      toast("Quantity required", { description: "Enter received quantity in MT." });
      return;
    }

    const nextDispatches = dispatches.map((d) =>
      d.id === active.id
        ? {
            ...d,
            status: "ARRIVED" as const,
            arrivedAt: Date.now(),
            receivedMT: qty,
            arrivedByName: name,
          }
        : d,
    );

    let nextNotifs = notifications;
    nextNotifs = pushNotification(
      "SITE",
      "Arrival confirmed",
      `${active.challanNo} • Received ${qty.toFixed(2)} MT`,
      nextNotifs,
      { dispatchId: active.id, partyId: active.partyId },
    );
    nextNotifs = pushNotification(
      "ADMIN",
      "Truck arrived",
      `${active.challanNo} arrived • Received ${qty.toFixed(2)} MT • By ${name}`,
      nextNotifs,
      { dispatchId: active.id, partyId: active.partyId },
    );

    persist(nextDispatches, nextNotifs);

    setArrivedName("");
    setReceivedMT("");
  }

  function acknowledgeLeft() {
    if (!party) return;
    if (party.status !== "ACTIVE") return;
    if (!active) return;
    if (active.status !== "ARRIVED") return;

    const name = leftName.trim();
    if (!name) {
      toast("Name required", { description: "Please enter your name to confirm departure." });
      return;
    }

    const nextDispatches = dispatches.map((d) =>
      d.id === active.id
        ? {
            ...d,
            status: "LEFT" as const,
            leftAt: Date.now(),
            leftByName: name,
          }
        : d,
    );

    let nextNotifs = notifications;
    nextNotifs = pushNotification(
      "SITE",
      "Departure confirmed",
      `${active.challanNo} • Truck left the site`,
      nextNotifs,
      { dispatchId: active.id, partyId: active.partyId },
    );
    nextNotifs = pushNotification(
      "ADMIN",
      "Truck left",
      `${active.challanNo} left • Confirmed by ${name}`,
      nextNotifs,
      { dispatchId: active.id, partyId: active.partyId },
    );

    persist(nextDispatches, nextNotifs);

    setLeftName("");
  }

  if (!party) {
    return (
      <div className="min-h-screen df-grid p-4">
        <div className="mx-auto w-full max-w-xl">
          <Card className="df-card p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive ring-1 ring-destructive/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div data-testid="text-site-invalid-title" className="font-serif text-xl">
                  Invalid link
                </div>
                <div data-testid="text-site-invalid-subtitle" className="text-sm text-muted-foreground">
                  This access link does not match any party/order.
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="text-sm text-muted-foreground">
              If you believe this is a mistake, ask the plant/admin team to share a valid link.
            </div>

            <div className="mt-4">
              <Link href="/admin" data-testid="link-back-admin" className="underline underline-offset-4">
                Go to admin
              </Link>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (party.status !== "ACTIVE") {
    return (
      <div className="min-h-screen df-grid p-4">
        <div className="mx-auto w-full max-w-xl">
          <Card className="df-card p-6">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/20">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <div data-testid="text-site-closed-title" className="font-serif text-xl">
                  Access closed
                </div>
                <div data-testid="text-site-closed-subtitle" className="text-sm text-muted-foreground">
                  This party/order is not active. You can no longer view or act from this link.
                </div>
              </div>
            </div>

            <Separator className="my-4" />

            <div className="text-sm text-muted-foreground">Please contact the admin team if you need a report or reconciliation.</div>

            <div className="mt-4">
              <Button data-testid="button-go-admin" variant="secondary" onClick={() => setLocation("/admin")}> 
                Go to admin dashboard
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen df-grid">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Truck className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div data-testid="text-site-title" className="font-serif text-[18px] leading-none">
                Site Acknowledgement
              </div>
              <div data-testid="text-site-project" className="text-xs text-muted-foreground">
                {party.partyCode} • {party.partyName}
              </div>
            </div>
          </div>

          <div className="ml-auto">
            <Link href="/admin" data-testid="link-admin" className="text-xs text-muted-foreground underline underline-offset-4">
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <Card className="df-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                      <PackageCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 data-testid="text-site-active-title" className="font-serif text-xl">
                        Current Dispatch
                      </h1>
                      <p data-testid="text-site-active-subtitle" className="text-sm text-muted-foreground">
                        Confirm arrival + received quantity, then confirm departure after unloading.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span data-testid="text-site-now">{format(Date.now(), "dd MMM • HH:mm")}</span>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              {!active ? (
                <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center" data-testid="empty-site">
                  <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
                  <div className="mt-3 font-serif text-lg">No active dispatch right now</div>
                  <div className="mt-1 text-sm text-muted-foreground">Wait for the next truck to be dispatched.</div>
                </div>
              ) : (
                <div className="space-y-4" data-testid="panel-site-active">
                  <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <div data-testid="text-site-challan" className="font-mono text-xs text-muted-foreground">
                        {active.challanNo}
                      </div>
                      {statusBadge(active.status)}
                      <Badge className="df-pill" variant="secondary" data-testid="badge-site-vehicle">
                        <Truck className="mr-1 h-3.5 w-3.5" />
                        {active.vehicleNo}
                      </Badge>
                    </div>

                    <div className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                      <div data-testid="text-site-party">
                        <span className="text-muted-foreground">Party:</span> {active.partyName} ({active.partyCode})
                      </div>
                      <div data-testid="text-site-site">
                        <span className="text-muted-foreground">Site:</span> {active.siteName}
                      </div>
                      <div data-testid="text-site-load">
                        <span className="text-muted-foreground">Load:</span> {active.loadMT.toFixed(2)} MT
                      </div>
                      <div data-testid="text-site-dispatched-at">
                        <span className="text-muted-foreground">Dispatched:</span> {format(active.createdAt, "dd MMM • HH:mm")}
                      </div>
                    </div>

                    {active.arrivedAt ? (
                      <div className="mt-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                        <div data-testid="text-site-arrived-line">
                          Arrived {format(active.arrivedAt, "dd MMM • HH:mm")} • By {active.arrivedByName} • Received {(active.receivedMT ?? 0).toFixed(2)} MT
                        </div>
                      </div>
                    ) : null}
                    {active.leftAt ? (
                      <div className="mt-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                        <div data-testid="text-site-left-line">Left {format(active.leftAt, "dd MMM • HH:mm")} • By {active.leftByName}</div>
                      </div>
                    ) : null}
                  </div>

                  {active.status === "DISPATCHED" ? (
                    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
                      <div className="text-sm font-medium" data-testid="text-arrival-form-title">
                        Arrival acknowledgement
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="arrivedName" data-testid="label-arrived-name">
                            Your name (required)
                          </Label>
                          <Input
                            id="arrivedName"
                            value={arrivedName}
                            onChange={(e) => setArrivedName(e.target.value)}
                            placeholder="e.g., Rakesh"
                            data-testid="input-arrived-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="received" data-testid="label-received-mt">
                            Received quantity (MT)
                          </Label>
                          <Input
                            id="received"
                            value={receivedMT}
                            onChange={(e) => setReceivedMT(e.target.value)}
                            inputMode="decimal"
                            placeholder="e.g., 18.2"
                            data-testid="input-received-mt"
                          />
                        </div>
                      </div>
                      <Button className="mt-4 w-full gap-2" onClick={acknowledgeArrived} data-testid="button-confirm-arrived">
                        <Check className="h-4 w-4" />
                        Confirm arrived
                      </Button>
                    </div>
                  ) : null}

                  {active.status === "ARRIVED" ? (
                    <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm">
                      <div className="text-sm font-medium" data-testid="text-left-form-title">
                        Departure acknowledgement
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="leftName" data-testid="label-left-name">
                            Your name (required)
                          </Label>
                          <Input
                            id="leftName"
                            value={leftName}
                            onChange={(e) => setLeftName(e.target.value)}
                            placeholder="e.g., Suresh"
                            data-testid="input-left-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="leftTime" data-testid="label-left-time">
                            Left time (auto)
                          </Label>
                          <Input
                            id="leftTime"
                            readOnly
                            value={format(Date.now(), "dd MMM • HH:mm")}
                            data-testid="input-left-time"
                          />
                        </div>
                      </div>
                      <Button className="mt-4 w-full gap-2" onClick={acknowledgeLeft} data-testid="button-confirm-left">
                        <Check className="h-4 w-4" />
                        Confirm truck left
                      </Button>
                    </div>
                  ) : null}
                </div>
              )}
            </Card>
          </section>

          <section className="lg:col-span-5">
            <Card className="df-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 data-testid="text-site-history-title" className="font-serif text-lg">
                    Dispatch history
                  </h2>
                  <p data-testid="text-site-history-subtitle" className="text-sm text-muted-foreground">
                    Recent challans for this party/order.
                  </p>
                </div>
                <Badge className="df-pill" variant="secondary" data-testid="badge-site-project">
                  {partyDispatches.length} trips
                </Badge>
              </div>

              <Separator className="my-4" />

              <div className="space-y-3">
                {partyDispatches.slice(0, 8).map((d) => (
                  <div
                    key={d.id}
                    className="rounded-2xl border border-border/70 bg-card/60 p-4 text-sm shadow-sm"
                    data-testid={`card-site-history-${d.id}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div data-testid={`text-site-history-challan-${d.id}`} className="font-mono text-xs text-muted-foreground">
                          {d.challanNo}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {statusBadge(d.status)}
                          <Badge className="df-pill" variant="secondary" data-testid={`badge-site-history-vehicle-${d.id}`}> 
                            <Truck className="mr-1 h-3.5 w-3.5" />
                            {d.vehicleNo}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div data-testid={`text-site-history-load-${d.id}`}>Load {d.loadMT.toFixed(2)} MT</div>
                        <div data-testid={`text-site-history-time-${d.id}`}>{format(d.createdAt, "dd MMM • HH:mm")}</div>
                      </div>
                    </div>

                    {d.arrivedAt ? (
                      <div className="mt-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                        <div data-testid={`text-site-history-arrived-${d.id}`}> 
                          Arrived {format(d.arrivedAt, "HH:mm")} • {d.arrivedByName} • Rec {(d.receivedMT ?? 0).toFixed(2)} MT
                        </div>
                      </div>
                    ) : null}
                    {d.leftAt ? (
                      <div className="mt-2 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                        <div data-testid={`text-site-history-left-${d.id}`}>Left {format(d.leftAt, "HH:mm")} • {d.leftByName}</div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {partyDispatches.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center" data-testid="empty-site-history">
                    <Truck className="mx-auto h-10 w-10 text-muted-foreground" />
                    <div className="mt-3 font-serif text-lg">No dispatches yet</div>
                    <div className="mt-1 text-sm text-muted-foreground">This party/order has no challans created in this browser.</div>
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="df-card mt-6 p-5">
              <div className="text-sm font-medium" data-testid="text-site-notice-title">
                Notifications (preview mode)
              </div>
              <div className="mt-2 text-sm text-muted-foreground" data-testid="text-site-notice">
                This page triggers sound + in-app notifications; enable browser notifications in the Admin tab for system alerts.
              </div>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}
