import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Link2,
  MapPin,
  PackageOpen,
  Plus,
  Search,
  Shield,
  Truck,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const APP_NAME = "DispatchFlow";

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
  notes?: string;
};

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string;
  totalRequiredMT: number;
  status: PartyStatus;
  accessId: string;
  reconciledMT: number;
  invoicedMT: number;
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

function safeUpper(s: string) {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
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
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.value = 0.0001;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
    o.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.14);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.32);
    o.stop(ctx.currentTime + 0.34);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // ignore
  }
}

function formatChallan(partyCode: string, seq: number) {
  return `${partyCode}-${String(seq).padStart(4, "0")}`;
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

  if (side === "ADMIN") {
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

function getInitialParties(): Party[] {
  return [
    {
      id: "party_aurora",
      partyName: "Aurora Infra (PMC)",
      partyCode: "AURORA",
      orderRefNo: "WO-ASP-001",
      totalRequiredMT: 2000,
      status: "ACTIVE",
      accessId: "aurora",
      reconciledMT: 0,
      invoicedMT: 0,
    },
    {
      id: "party_brookfield",
      partyName: "Brookfield Projects",
      partyCode: "BROOK",
      orderRefNo: "REF-TB-42",
      totalRequiredMT: 1200,
      status: "ACTIVE",
      accessId: "brook",
      reconciledMT: 0,
      invoicedMT: 0,
    },
  ];
}

function loadState() {
  const partiesKey = "df_parties_v2";
  const dispatchesKey = "df_dispatches_v2";
  const seqKey = "df_party_seq_v2";
  const notifsKey = "df_notifications_v2";

  const parties = (JSON.parse(localStorage.getItem(partiesKey) || "null") as Party[] | null) ?? getInitialParties();
  const dispatches = (JSON.parse(localStorage.getItem(dispatchesKey) || "null") as Dispatch[] | null) ?? [];
  const seq = (JSON.parse(localStorage.getItem(seqKey) || "null") as Record<string, number> | null) ?? {};
  const notifications = (JSON.parse(localStorage.getItem(notifsKey) || "null") as NotificationEvent[] | null) ?? [];

  return { parties, dispatches, seq, notifications };
}

function saveState(
  parties: Party[],
  dispatches: Dispatch[],
  seq: Record<string, number>,
  notifications: NotificationEvent[],
) {
  localStorage.setItem("df_parties_v2", JSON.stringify(parties));
  localStorage.setItem("df_dispatches_v2", JSON.stringify(dispatches));
  localStorage.setItem("df_party_seq_v2", JSON.stringify(seq));
  localStorage.setItem("df_notifications_v2", JSON.stringify(notifications));
}

function getPartyTotals(dispatches: Dispatch[], partyId: string) {
  const byParty = dispatches.filter((d) => d.partyId === partyId);
  const dispatched = byParty.reduce((sum, d) => sum + d.loadMT, 0);
  const received = byParty.reduce((sum, d) => sum + (d.receivedMT ?? 0), 0);
  const leftCount = byParty.filter((d) => d.status === "LEFT").length;
  return { dispatched, received, leftCount, count: byParty.length };
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

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  const [{ parties: initialParties, dispatches: initialDispatches, seq: initialSeq, notifications: initialNotifications }] =
    useState(() => loadState());

  const [parties, setParties] = useState<Party[]>(initialParties);
  const [dispatches, setDispatches] = useState<Dispatch[]>(initialDispatches);
  const [seqByParty, setSeqByParty] = useState<Record<string, number>>(initialSeq);
  const [notifications, setNotifications] = useState<NotificationEvent[]>(initialNotifications);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | DispatchStatus>("ALL");
  const [partyFilter, setPartyFilter] = useState<string>("ALL");

  const [dispatchPartyId, setDispatchPartyId] = useState(parties[0]?.id ?? "");
  const [siteName, setSiteName] = useState("");
  const [loadMT, setLoadMT] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");

  const [newPartyName, setNewPartyName] = useState("");
  const [newPartyCode, setNewPartyCode] = useState("");
  const [newOrderRefNo, setNewOrderRefNo] = useState("");
  const [newTotalRequired, setNewTotalRequired] = useState("");
  const [newStatus, setNewStatus] = useState<PartyStatus>("ACTIVE");

  const [lastCreatedChallan, setLastCreatedChallan] = useState<string>("");

  const shareBase = useMemo(() => {
    try {
      return `${window.location.origin}/site/`;
    } catch {
      return "/site/";
    }
  }, []);

  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  const activeCount = useMemo(() => dispatches.filter((d) => d.status !== "LEFT").length, [dispatches]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return dispatches
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .filter((d) => {
        if (statusFilter !== "ALL" && d.status !== statusFilter) return false;
        if (partyFilter !== "ALL" && d.partyId !== partyFilter) return false;
        if (!needle) return true;
        const hay = `${d.challanNo} ${d.partyName} ${d.partyCode} ${d.siteName} ${d.vehicleNo}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [dispatches, q, statusFilter, partyFilter]);

  const notifCount = useMemo(() => notifications.filter((n) => n.side === "ADMIN").length, [notifications]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "df_parties_v2" ||
        e.key === "df_dispatches_v2" ||
        e.key === "df_party_seq_v2" ||
        e.key === "df_notifications_v2"
      ) {
        const s = loadState();
        setParties(s.parties);
        setDispatches(s.dispatches);
        setSeqByParty(s.seq);
        setNotifications(s.notifications);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function persist(nextParties: Party[], nextDispatches: Dispatch[], nextSeq: Record<string, number>, nextNotifs: NotificationEvent[]) {
    setParties(nextParties);
    setDispatches(nextDispatches);
    setSeqByParty(nextSeq);
    setNotifications(nextNotifs);
    saveState(nextParties, nextDispatches, nextSeq, nextNotifs);
  }

  function ensureNotifPermission() {
    try {
      if (!("Notification" in window)) {
        toast("Browser notifications unavailable", { description: "This browser does not support notifications." });
        return;
      }
      if (Notification.permission === "granted") {
        toast("Notifications enabled", { description: "You will receive browser notifications in this tab." });
        return;
      }
      Notification.requestPermission().then((p) => {
        if (p === "granted") {
          toast("Notifications enabled", { description: "You will receive browser notifications in this tab." });
          notifyBrowser("DispatchFlow", "Notifications are enabled.");
        } else {
          toast("Notifications not enabled", { description: "You can still use the in-app Notifications Log." });
        }
      });
    } catch {
      toast("Notifications not available", { description: "You can still use the in-app Notifications Log." });
    }
  }

  function canCreateDispatch() {
    const p = partyById.get(dispatchPartyId);
    if (!p) return false;
    if (p.status !== "ACTIVE") return false;
    if (!siteName.trim()) return false;
    if (!vehicleNo.trim()) return false;
    const m = clampNum(loadMT);
    if (m <= 0) return false;
    return true;
  }

  function computeNextSeq(partyId: string) {
    const persisted = (JSON.parse(localStorage.getItem("df_party_seq_v2") || "null") as Record<string, number> | null) ?? {};
    const inMemory = seqByParty;
    const current = Math.max(persisted[partyId] ?? 0, inMemory[partyId] ?? 0);
    return current + 1;
  }

  function onCreateDispatch() {
    if (!canCreateDispatch()) return;

    const p = partyById.get(dispatchPartyId)!;
    const nextSeqForParty = computeNextSeq(p.id);
    const challanNo = formatChallan(p.partyCode, nextSeqForParty);

    const d: Dispatch = {
      id: uid("disp"),
      challanNo,
      partyId: p.id,
      partyName: p.partyName,
      partyCode: p.partyCode,
      orderRefNo: p.orderRefNo,
      siteName: siteName.trim(),
      vehicleNo: safeUpper(vehicleNo),
      loadMT: clampNum(loadMT),
      createdAt: Date.now(),
      status: "DISPATCHED",
      notes: notes.trim() || undefined,
    };

    const nextDispatches = [d, ...dispatches];
    const nextSeqByParty = { ...seqByParty, [p.id]: nextSeqForParty };

    let nextNotifs = notifications;
    nextNotifs = pushNotification(
      "ADMIN",
      "Dispatch created",
      `${d.challanNo} • ${d.partyName} • ${d.loadMT.toFixed(2)} MT • ${d.vehicleNo}`,
      nextNotifs,
      { dispatchId: d.id, partyId: d.partyId },
    );
    nextNotifs = pushNotification(
      "SITE",
      "Truck dispatched",
      `${d.challanNo} is on the way. Vehicle: ${d.vehicleNo}`,
      nextNotifs,
      { dispatchId: d.id, partyId: d.partyId },
    );

    persist(parties, nextDispatches, nextSeqByParty, nextNotifs);
    setLastCreatedChallan(d.challanNo);

    toast("Dispatch created", { description: `Challan ${d.challanNo}` });

    setSiteName("");
    setLoadMT("");
    setVehicleNo("");
    setNotes("");
  }

  function copyLink(accessId: string) {
    const url = `${shareBase}${accessId}`;
    navigator.clipboard
      .writeText(url)
      .then(() => {
        toast("Link copied", { description: url });
      })
      .catch(() => {
        toast("Copy failed", { description: url });
      });
  }

  function setPartyStatus(partyIdToUpdate: string, status: PartyStatus) {
    const nextParties = parties.map((p) => (p.id === partyIdToUpdate ? { ...p, status } : p));
    persist(nextParties, dispatches, seqByParty, notifications);
  }

  function reconcileAndInvoice(partyIdToUpdate: string) {
    const p = partyById.get(partyIdToUpdate);
    if (!p) return;
    const totals = getPartyTotals(dispatches, partyIdToUpdate);
    const nextParties = parties.map((x) =>
      x.id === partyIdToUpdate
        ? {
            ...x,
            reconciledMT: totals.received,
            invoicedMT: totals.received,
            status: "CLOSED" as const,
          }
        : x,
    );

    let nextNotifs = notifications;
    nextNotifs = pushNotification(
      "ADMIN",
      "Reconciled & invoiced",
      `${p.partyCode} closed • Link deactivated`,
      nextNotifs,
      { partyId: p.id },
    );
    nextNotifs = pushNotification(
      "SITE",
      "Access closed",
      `${p.partyCode} has been closed. This link is now inactive.`,
      nextNotifs,
      { partyId: p.id },
    );

    persist(nextParties, dispatches, seqByParty, nextNotifs);
  }

  function canCreateParty() {
    const name = newPartyName.trim();
    const code = safeUpper(newPartyCode).replace(/[^A-Z0-9]/g, "");
    const mt = clampNum(newTotalRequired);
    if (!name) return false;
    if (!code) return false;
    if (mt <= 0) return false;
    if (parties.some((p) => p.partyCode === code)) return false;
    return true;
  }

  function createParty() {
    if (!canCreateParty()) return;
    const name = newPartyName.trim();
    const code = safeUpper(newPartyCode).replace(/[^A-Z0-9]/g, "");
    const mt = clampNum(newTotalRequired);
    const ref = newOrderRefNo.trim() || undefined;

    const p: Party = {
      id: uid("party"),
      partyName: name,
      partyCode: code,
      orderRefNo: ref,
      totalRequiredMT: mt,
      status: newStatus,
      accessId: slugify(code || name) || uid("access"),
      reconciledMT: 0,
      invoicedMT: 0,
    };

    const nextParties = [p, ...parties];

    let nextNotifs = notifications;
    nextNotifs = pushNotification(
      "ADMIN",
      "Party/Order created",
      `${p.partyCode} • ${p.partyName} • Req ${p.totalRequiredMT} MT`,
      nextNotifs,
      { partyId: p.id },
    );

    persist(nextParties, dispatches, seqByParty, nextNotifs);

    setNewPartyName("");
    setNewPartyCode("");
    setNewOrderRefNo("");
    setNewTotalRequired("");
    setNewStatus("ACTIVE");
  }

  return (
    <div className="min-h-screen df-grid">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              <Truck className="h-5 w-5" strokeWidth={2} />
            </div>
            <div>
              <div data-testid="text-app-title" className="font-serif text-[18px] leading-none">
                {APP_NAME}
              </div>
              <div data-testid="text-app-subtitle" className="text-xs text-muted-foreground">
                Dispatch + site acknowledgements • challans by party • reconciliation
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:flex">
              <Activity className="h-4 w-4" />
              <span data-testid="text-active-count">{activeCount} active</span>
            </div>
            <Button variant="secondary" className="gap-2" data-testid="button-enable-notifications" onClick={ensureNotifPermission}>
              <Bell className="h-4 w-4" />
              Enable alerts
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              data-testid="button-notifications"
              onClick={() => {
                const last = notifications.filter((n) => n.side === "ADMIN").slice(0, 8);
                toast("Recent updates", {
                  description: last.length
                    ? last.map((n) => `${format(n.ts, "HH:mm")} • ${n.title}`).join("\n")
                    : "No notifications yet.",
                });
              }}
            >
              <span className="hidden sm:inline">Log</span>
              <span
                data-testid="text-notification-count"
                className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-[11px] text-primary"
              >
                {notifCount}
              </span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="lg:col-span-5">
            <Card className="df-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                      <ClipboardList className="h-5 w-5" />
                    </div>
                    <div>
                      <h1 data-testid="text-new-dispatch-title" className="font-serif text-xl">
                        New Dispatch
                      </h1>
                      <p data-testid="text-new-dispatch-hint" className="text-sm text-muted-foreground">
                        Select party/order — challan is auto-generated per party.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="hidden rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:block">
                  <div className="flex flex-col gap-1">
                    <span data-testid="text-challan-format" className="font-mono">
                      PARTYCODE-0001
                    </span>
                    {lastCreatedChallan ? (
                      <span data-testid="text-last-created-challan" className="font-mono text-foreground">
                        Last: {lastCreatedChallan}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="party" data-testid="label-party">
                    Party / Order
                  </Label>
                  <Select value={dispatchPartyId} onValueChange={setDispatchPartyId}>
                    <SelectTrigger id="party" data-testid="select-party">
                      <SelectValue placeholder="Select a party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`select-item-party-${p.id}`}>
                          {p.partyCode} — {p.partyName}
                          {p.orderRefNo ? ` (${p.orderRefNo})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="site" data-testid="label-site">
                      Site
                    </Label>
                    <Input
                      id="site"
                      value={siteName}
                      onChange={(e) => setSiteName(e.target.value)}
                      placeholder="e.g., Gate 2 / Pouring Zone"
                      data-testid="input-site"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="load" data-testid="label-load">
                      Load (MT)
                    </Label>
                    <Input
                      id="load"
                      value={loadMT}
                      onChange={(e) => setLoadMT(e.target.value)}
                      inputMode="decimal"
                      placeholder="e.g., 18.5"
                      data-testid="input-load-mt"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vehicle" data-testid="label-vehicle">
                      Vehicle No.
                    </Label>
                    <Input
                      id="vehicle"
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      placeholder="e.g., MH12 AB 1234"
                      data-testid="input-vehicle"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="now" data-testid="label-auto-time">
                      Dispatch time (auto)
                    </Label>
                    <Input id="now" readOnly value={format(Date.now(), "dd MMM yyyy • HH:mm")} data-testid="input-dispatch-time" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" data-testid="label-notes">
                    Notes (optional)
                  </Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any instruction for the site / driver"
                    className="min-h-[80px]"
                    data-testid="textarea-notes"
                  />
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-muted-foreground">
                    <div data-testid="text-dispatch-rules">Lifecycle: DISPATCHED → ARRIVED → LEFT</div>
                    <div data-testid="text-site-link-rules">Site actions require name + received quantity + timestamps.</div>
                  </div>
                  <Button
                    className="gap-2"
                    onClick={onCreateDispatch}
                    disabled={!canCreateDispatch()}
                    data-testid="button-create-dispatch"
                  >
                    <Plus className="h-4 w-4" />
                    Create dispatch
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="df-card mt-6 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 data-testid="text-parties-title" className="font-serif text-lg">
                    Parties / Orders (Master)
                  </h2>
                  <p data-testid="text-parties-subtitle" className="text-sm text-muted-foreground">
                    Create & manage parties/orders, requirement tracking, and external access.
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:flex">
                  <Users className="h-4 w-4" />
                  Master
                </div>
              </div>

              <Separator className="my-4" />

              <div className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm" data-testid="card-party-create">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label data-testid="label-party-name" htmlFor="partyName">
                      Party Name
                    </Label>
                    <Input
                      id="partyName"
                      value={newPartyName}
                      onChange={(e) => setNewPartyName(e.target.value)}
                      placeholder="e.g., Skyline Contractors"
                      data-testid="input-party-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label data-testid="label-party-code" htmlFor="partyCode">
                      Party Code (unique)
                    </Label>
                    <Input
                      id="partyCode"
                      value={newPartyCode}
                      onChange={(e) => setNewPartyCode(e.target.value)}
                      placeholder="e.g., SKYLINE"
                      data-testid="input-party-code"
                    />
                    <div className="text-[11px] text-muted-foreground" data-testid="text-party-code-hint">
                      Challans will look like <span className="font-mono">{safeUpper(newPartyCode).replace(/[^A-Z0-9]/g, "") || "PARTY"}-0001</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label data-testid="label-order-ref" htmlFor="orderRef">
                      Order / Work Ref No (optional)
                    </Label>
                    <Input
                      id="orderRef"
                      value={newOrderRefNo}
                      onChange={(e) => setNewOrderRefNo(e.target.value)}
                      placeholder="e.g., WO-2026-017"
                      data-testid="input-order-ref"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label data-testid="label-total-required" htmlFor="totalRequired">
                      Total Required (MT)
                    </Label>
                    <Input
                      id="totalRequired"
                      value={newTotalRequired}
                      onChange={(e) => setNewTotalRequired(e.target.value)}
                      inputMode="decimal"
                      placeholder="e.g., 2000"
                      data-testid="input-total-required"
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="grid w-full grid-cols-1 gap-3 sm:w-auto sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label data-testid="label-party-status" htmlFor="status">
                        Status
                      </Label>
                      <Select value={newStatus} onValueChange={(v) => setNewStatus(v as PartyStatus)}>
                        <SelectTrigger id="status" data-testid="select-party-status">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ACTIVE" data-testid="select-item-status-active">
                            Active
                          </SelectItem>
                          <SelectItem value="INACTIVE" data-testid="select-item-status-inactive">
                            Inactive
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button className="gap-2" onClick={createParty} disabled={!canCreateParty()} data-testid="button-create-party">
                    <Plus className="h-4 w-4" />
                    Create party/order
                  </Button>
                </div>

                {!canCreateParty() && (newPartyName.trim() || newPartyCode.trim() || newTotalRequired.trim()) ? (
                  <div className="mt-3 text-xs text-muted-foreground" data-testid="text-party-create-validation">
                    Ensure: name + unique code + required MT &gt; 0.
                  </div>
                ) : null}
              </div>

              <div className="mt-4 space-y-4">
                {parties.map((p) => {
                  const totals = getPartyTotals(dispatches, p.id);
                  const remaining = Math.max(0, p.totalRequiredMT - totals.dispatched);
                  const pct = p.totalRequiredMT > 0 ? Math.min(100, (totals.dispatched / p.totalRequiredMT) * 100) : 0;
                  const url = `${shareBase}${p.accessId}`;
                  const isActive = p.status === "ACTIVE";

                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm"
                      data-testid={`card-party-${p.id}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div data-testid={`text-party-code-${p.id}`} className="font-mono text-xs text-muted-foreground">
                              {p.partyCode}
                            </div>
                            <div data-testid={`text-party-name-${p.id}`} className="font-medium">
                              {p.partyName}
                            </div>
                            {p.orderRefNo ? (
                              <Badge className="df-pill" variant="secondary" data-testid={`badge-party-ref-${p.id}`}>
                                {p.orderRefNo}
                              </Badge>
                            ) : null}

                            {p.status === "ACTIVE" ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20" data-testid={`badge-party-status-active-${p.id}`}>
                                Active
                              </Badge>
                            ) : p.status === "INACTIVE" ? (
                              <Badge className="bg-slate-500/10 text-slate-700 border-slate-500/20" data-testid={`badge-party-status-inactive-${p.id}`}>
                                Inactive
                              </Badge>
                            ) : (
                              <Badge className="bg-primary/10 text-primary border-primary/20" data-testid={`badge-party-status-closed-${p.id}`}>
                                Closed
                              </Badge>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                            <div data-testid={`text-required-${p.id}`}>
                              Required: <span className="font-medium text-foreground">{p.totalRequiredMT} MT</span>
                            </div>
                            <div data-testid={`text-dispatched-${p.id}`}>
                              Dispatched: <span className="font-medium text-foreground">{totals.dispatched.toFixed(2)} MT</span>
                            </div>
                            <div data-testid={`text-remaining-${p.id}`}>
                              Remaining: <span className="font-medium text-foreground">{remaining.toFixed(2)} MT</span>
                            </div>
                            <div data-testid={`text-trips-${p.id}`}>
                              Trips: <span className="font-medium text-foreground">{totals.count}</span>
                            </div>
                          </div>

                          <div className="mt-3">
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" data-testid={`progressbar-${p.id}`}>
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                              <span data-testid={`text-progress-${p.id}`}>{pct.toFixed(0)}% dispatched</span>
                              <span data-testid={`text-link-slug-${p.id}`}>/site/{p.accessId}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              className="gap-2"
                              data-testid={`button-copy-link-${p.id}`}
                              onClick={() => copyLink(p.accessId)}
                              disabled={!isActive}
                            >
                              <Link2 className="h-4 w-4" />
                              Copy link
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-2"
                              data-testid={`button-open-link-${p.id}`}
                              onClick={() => setLocation(`/site/${p.accessId}`)}
                              disabled={!isActive}
                            >
                              <MapPin className="h-4 w-4" />
                              Open
                            </Button>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span data-testid={`text-access-toggle-${p.id}`}>Active</span>
                            </div>
                            <Switch
                              checked={p.status === "ACTIVE"}
                              onCheckedChange={(v) => setPartyStatus(p.id, v ? "ACTIVE" : "INACTIVE")}
                              disabled={p.status === "CLOSED"}
                              data-testid={`switch-access-${p.id}`}
                            />
                          </div>

                          <Button
                            className="mt-1 gap-2"
                            variant="destructive"
                            data-testid={`button-reconcile-${p.id}`}
                            onClick={() => reconcileAndInvoice(p.id)}
                            disabled={p.status === "CLOSED"}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Reconciled & invoiced
                          </Button>

                          <div className="text-[11px] text-muted-foreground" data-testid={`text-share-url-${p.id}`}>
                            {url}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <Separator className="my-5" />

              <div className="rounded-2xl border border-border/70 bg-card/50 p-4" data-testid="panel-notifications-log">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div data-testid="text-notif-log-title" className="font-medium">
                      Notifications Log
                    </div>
                    <div data-testid="text-notif-log-subtitle" className="text-xs text-muted-foreground">
                      Preview-mode alerts: browser notification (if enabled) + sound + this log.
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="gap-2"
                    data-testid="button-clear-notifs"
                    onClick={() => {
                      persist(parties, dispatches, seqByParty, []);
                      toast("Cleared", { description: "Notification log cleared." });
                    }}
                  >
                    Clear
                  </Button>
                </div>

                <div className="mt-3 space-y-2">
                  {notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      className="rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs"
                      data-testid={`row-notif-${n.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 truncate">
                          <span className="font-medium">{n.title}</span>
                          <span className="text-muted-foreground"> — {n.message}</span>
                        </div>
                        <div className="shrink-0 text-muted-foreground">{format(n.ts, "HH:mm")}</div>
                      </div>
                    </div>
                  ))}
                  {notifications.length === 0 ? (
                    <div
                      className="rounded-xl border border-dashed border-border/70 bg-card/40 p-6 text-center text-xs text-muted-foreground"
                      data-testid="empty-notifs"
                    >
                      No notifications yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </section>

          <section className="lg:col-span-7">
            <Card className="df-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 data-testid="text-active-dispatches-title" className="font-serif text-lg">
                    Dispatches
                  </h2>
                  <p data-testid="text-active-dispatches-subtitle" className="text-sm text-muted-foreground">
                    Live status, history, and reporting filters.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search challan, party, vehicle…"
                      className="pl-9"
                      data-testid="input-search"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs text-muted-foreground">
                      <Filter className="h-4 w-4" />
                      <span data-testid="text-filter-label">Filters</span>
                    </div>

                    <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                      <SelectTrigger className="w-[160px]" data-testid="select-status">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" data-testid="select-item-status-all">
                          All
                        </SelectItem>
                        <SelectItem value="DISPATCHED" data-testid="select-item-status-dispatched">
                          Dispatched
                        </SelectItem>
                        <SelectItem value="ARRIVED" data-testid="select-item-status-arrived">
                          Arrived
                        </SelectItem>
                        <SelectItem value="LEFT" data-testid="select-item-status-left">
                          Left
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={partyFilter} onValueChange={(v) => setPartyFilter(v)}>
                      <SelectTrigger className="w-[210px]" data-testid="select-party-filter">
                        <SelectValue placeholder="Party" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" data-testid="select-item-party-filter-all">
                          All parties
                        </SelectItem>
                        {parties.map((p) => (
                          <SelectItem key={p.id} value={p.id} data-testid={`select-item-party-filter-${p.id}`}>
                            {p.partyCode}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <Tabs defaultValue="active" className="w-full">
                <TabsList className="grid w-full grid-cols-3" data-testid="tabs-dispatches">
                  <TabsTrigger value="active" data-testid="tab-active">
                    Active
                  </TabsTrigger>
                  <TabsTrigger value="history" data-testid="tab-history">
                    History
                  </TabsTrigger>
                  <TabsTrigger value="report" data-testid="tab-report">
                    Report
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="active" className="mt-4">
                  <div className="space-y-3">
                    {filtered
                      .filter((d) => d.status !== "LEFT")
                      .map((d) => (
                        <div
                          key={d.id}
                          className="group rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm transition hover:shadow-md"
                          data-testid={`card-dispatch-${d.id}`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <div data-testid={`text-challan-${d.id}`} className="font-mono text-xs text-muted-foreground">
                                  {d.challanNo}
                                </div>
                                {statusBadge(d.status)}
                                <Badge className="df-pill" variant="secondary" data-testid={`badge-vehicle-${d.id}`}>
                                  <Truck className="mr-1 h-3.5 w-3.5" />
                                  {d.vehicleNo}
                                </Badge>
                              </div>

                              <div className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                                <div data-testid={`text-party-${d.id}`} className="truncate">
                                  <span className="text-muted-foreground">Party:</span> {d.partyName} ({d.partyCode})
                                </div>
                                <div data-testid={`text-site-${d.id}`} className="truncate">
                                  <span className="text-muted-foreground">Site:</span> {d.siteName}
                                </div>
                                <div data-testid={`text-orderref-${d.id}`} className="truncate">
                                  <span className="text-muted-foreground">Ref:</span> {d.orderRefNo ?? "—"}
                                </div>
                                <div data-testid={`text-load-${d.id}`}>
                                  <span className="text-muted-foreground">Load:</span> {d.loadMT.toFixed(2)} MT
                                </div>
                              </div>

                              <div className="mt-2 text-xs text-muted-foreground">
                                <span data-testid={`text-created-${d.id}`}>Dispatched {format(d.createdAt, "dd MMM • HH:mm")}</span>
                                {d.arrivedAt ? (
                                  <>
                                    <span className="mx-2">•</span>
                                    <span data-testid={`text-arrived-${d.id}`}>
                                      Arrived {format(d.arrivedAt, "dd MMM • HH:mm")} ({d.arrivedByName})
                                    </span>
                                  </>
                                ) : null}
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                              <Button
                                variant="secondary"
                                className="gap-2"
                                data-testid={`button-open-site-${d.id}`}
                                onClick={() => {
                                  const p = partyById.get(d.partyId);
                                  if (!p || p.status !== "ACTIVE") {
                                    toast("Link inactive", { description: "This party/order is inactive or closed." });
                                    return;
                                  }
                                  setLocation(`/site/${p.accessId}?dispatchId=${encodeURIComponent(d.id)}`);
                                }}
                              >
                                <Link2 className="h-4 w-4" />
                                Open trip
                              </Button>
                              <div
                                className="rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground"
                                data-testid={`text-site-link-${d.id}`}
                              >
                                /site/{partyById.get(d.partyId)?.accessId}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                    {filtered.filter((d) => d.status !== "LEFT").length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center" data-testid="empty-active">
                        <PackageOpen className="mx-auto h-10 w-10 text-muted-foreground" />
                        <div className="mt-3 font-serif text-lg">No active dispatches</div>
                        <div className="mt-1 text-sm text-muted-foreground">Create the first dispatch to start tracking.</div>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                  <div className="space-y-3">
                    {filtered
                      .filter((d) => d.status === "LEFT")
                      .map((d) => (
                        <div
                          key={d.id}
                          className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm"
                          data-testid={`row-history-${d.id}`}
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <div data-testid={`text-history-challan-${d.id}`} className="font-mono text-xs text-muted-foreground">
                                  {d.challanNo}
                                </div>
                                {statusBadge(d.status)}
                                <Badge className="df-pill" variant="secondary" data-testid={`badge-history-vehicle-${d.id}`}>
                                  <Truck className="mr-1 h-3.5 w-3.5" />
                                  {d.vehicleNo}
                                </Badge>
                              </div>
                              <div className="mt-2 text-sm">
                                <div data-testid={`text-history-party-${d.id}`}>
                                  <span className="text-muted-foreground">{d.partyCode}</span> — {d.partyName}
                                </div>
                                <div data-testid={`text-history-site-${d.id}`} className="text-muted-foreground">
                                  {d.siteName}
                                </div>
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              <div data-testid={`text-history-times-${d.id}`}>
                                Dispatched {format(d.createdAt, "dd MMM • HH:mm")} → Arrived{" "}
                                {d.arrivedAt ? format(d.arrivedAt, "HH:mm") : "—"} → Left {d.leftAt ? format(d.leftAt, "HH:mm") : "—"}
                              </div>
                              <div data-testid={`text-history-qty-${d.id}`}>
                                Load {d.loadMT.toFixed(2)} MT • Received {(d.receivedMT ?? 0).toFixed(2)} MT
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                    {filtered.filter((d) => d.status === "LEFT").length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center" data-testid="empty-history">
                        <FileText className="mx-auto h-10 w-10 text-muted-foreground" />
                        <div className="mt-3 font-serif text-lg">No completed trips yet</div>
                        <div className="mt-1 text-sm text-muted-foreground">Completed dispatches will appear here.</div>
                      </div>
                    ) : null}
                  </div>
                </TabsContent>

                <TabsContent value="report" className="mt-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                    {parties.map((p) => {
                      const totals = getPartyTotals(dispatches, p.id);
                      const remaining = Math.max(0, p.totalRequiredMT - totals.dispatched);
                      const fulfilled = remaining <= 0;
                      return (
                        <div key={p.id} className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm" data-testid={`card-report-${p.id}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div data-testid={`text-report-party-${p.id}`} className="font-medium">
                                {p.partyCode}
                              </div>
                              <div className="text-xs text-muted-foreground" data-testid={`text-report-name-${p.id}`}>
                                {p.partyName}
                              </div>
                            </div>
                            <Badge className="df-pill" variant="secondary" data-testid={`badge-report-required-${p.id}`}>
                              Req {p.totalRequiredMT} MT
                            </Badge>
                          </div>

                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div data-testid={`text-report-dispatched-${p.id}`}>
                              <span className="text-muted-foreground">Dispatched</span>
                              <div className="font-medium">{totals.dispatched.toFixed(2)} MT</div>
                            </div>
                            <div data-testid={`text-report-remaining-${p.id}`}>
                              <span className="text-muted-foreground">Remaining</span>
                              <div className="font-medium">{remaining.toFixed(2)} MT</div>
                            </div>
                            <div data-testid={`text-report-received-${p.id}`}>
                              <span className="text-muted-foreground">Received</span>
                              <div className="font-medium">{totals.received.toFixed(2)} MT</div>
                            </div>
                            <div data-testid={`text-report-status-${p.id}`}>
                              <span className="text-muted-foreground">Status</span>
                              <div className="font-medium">{fulfilled ? "Fulfilled" : p.status}</div>
                            </div>
                          </div>

                          <div className="mt-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground">
                            <div data-testid={`text-report-reconcile-${p.id}`}>Reconciled: {p.reconciledMT.toFixed(2)} MT</div>
                            <div data-testid={`text-report-invoiced-${p.id}`}>Invoiced: {p.invoicedMT.toFixed(2)} MT</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </Card>

            <Card className="df-card mt-6 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 data-testid="text-demo-note-title" className="font-serif text-lg">
                    Notifications (preview mode)
                  </h2>
                  <p data-testid="text-demo-note" className="text-sm text-muted-foreground">
                    Enable browser notifications for testable alerts, plus sound + in-app log fallback.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  data-testid="button-test-sound"
                  onClick={() => {
                    beep();
                    notifyBrowser("Test alert", "Sound + browser notification (if enabled).");
                    toast("Test alert", { description: "Sound + toast (local preview)." });
                  }}
                >
                  <Bell className="h-4 w-4" />
                  Test alert
                </Button>
              </div>
              <Separator className="my-4" />
              <div className="text-xs text-muted-foreground">
                Tip: open <span className="font-mono">/admin</span> and a <span className="font-mono">/site/…</span> link in another tab. Actions will trigger sound alerts in that tab.
              </div>
            </Card>
          </section>
        </div>

        <footer className="mt-10 pb-10 text-center text-xs text-muted-foreground">
          <div data-testid="text-footer">Prototype only • data stored in this browser • no backend writes</div>
          <div className="mt-1">
            <Link href="/admin" data-testid="link-admin" className="underline underline-offset-4">
              Admin dashboard
            </Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
