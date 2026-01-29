import { useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity,
  Bell,
  CheckCircle2,
  ClipboardList,
  FileText,
  Filter,
  Hash,
  Link2,
  MapPin,
  PackageOpen,
  Plus,
  Search,
  Shield,
  Truck,
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

type Dispatch = {
  id: string;
  challanNo: string;
  partyId: string;
  partyName: string;
  projectName: string;
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
  name: string;
  projectName: string;
  totalRequirementMT: number;
  activeAccess: boolean;
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

function formatChallan(n: number) {
  const yy = new Date().getFullYear().toString().slice(-2);
  const mm = String(new Date().getMonth() + 1).padStart(2, "0");
  return `DC-${yy}${mm}-${String(n).padStart(5, "0")}`;
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

function pushLocalNotification(
  side: "ADMIN" | "SITE",
  title: string,
  message: string,
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

  const key = "df_notifications";
  const prev = JSON.parse(localStorage.getItem(key) || "[]") as NotificationEvent[];
  const next = [entry, ...prev].slice(0, 80);
  localStorage.setItem(key, JSON.stringify(next));

  if (side === "ADMIN") {
    toast(title, { description: message });
  }
  beep();

  try {
    window.dispatchEvent(new CustomEvent("df:notify", { detail: entry }));
  } catch {
    // ignore
  }
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

function clampNum(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

function safeUpper(s: string) {
  return s.replace(/\s+/g, " ").trim().toUpperCase();
}

function getInitialParties(): Party[] {
  return [
    {
      id: "party_aurora",
      name: "Aurora Infra (PMC)",
      projectName: "Aurora Smart Park",
      totalRequirementMT: 2000,
      activeAccess: true,
      accessId: "aurora-smart-park",
      reconciledMT: 0,
      invoicedMT: 0,
    },
    {
      id: "party_brookfield",
      name: "Brookfield Projects",
      projectName: "Brookfield Tower B",
      totalRequirementMT: 1200,
      activeAccess: true,
      accessId: "brookfield-tower-b",
      reconciledMT: 0,
      invoicedMT: 0,
    },
  ];
}

function loadState() {
  const partiesKey = "df_parties_v1";
  const dispatchesKey = "df_dispatches_v1";
  const seqKey = "df_challan_seq_v1";

  const parties = (JSON.parse(localStorage.getItem(partiesKey) || "null") as Party[] | null) ?? getInitialParties();
  const dispatches = (JSON.parse(localStorage.getItem(dispatchesKey) || "null") as Dispatch[] | null) ?? [];
  const seq = Number(localStorage.getItem(seqKey) || "0") || 0;

  return { parties, dispatches, seq };
}

function saveState(parties: Party[], dispatches: Dispatch[], seq: number) {
  localStorage.setItem("df_parties_v1", JSON.stringify(parties));
  localStorage.setItem("df_dispatches_v1", JSON.stringify(dispatches));
  localStorage.setItem("df_challan_seq_v1", String(seq));
}

function getPartyTotals(dispatches: Dispatch[], partyId: string) {
  const byParty = dispatches.filter((d) => d.partyId === partyId);
  const dispatched = byParty.reduce((sum, d) => sum + d.loadMT, 0);
  const received = byParty.reduce((sum, d) => sum + (d.receivedMT ?? 0), 0);
  const leftCount = byParty.filter((d) => d.status === "LEFT").length;
  return { dispatched, received, leftCount, count: byParty.length };
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();

  const [{ parties: initialParties, dispatches: initialDispatches, seq: initialSeq }] = useState(() => loadState());
  const [parties, setParties] = useState<Party[]>(initialParties);
  const [dispatches, setDispatches] = useState<Dispatch[]>(initialDispatches);
  const [seq, setSeq] = useState<number>(initialSeq);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | DispatchStatus>("ALL");
  const [partyFilter, setPartyFilter] = useState<string>("ALL");

  const [partyId, setPartyId] = useState(parties[0]?.id ?? "");
  const [siteName, setSiteName] = useState("");
  const [loadMT, setLoadMT] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [notes, setNotes] = useState("");

  const shareBase = useMemo(() => {
    try {
      return `${window.location.origin}/site/`;
    } catch {
      return "/site/";
    }
  }, []);

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
        const hay = `${d.challanNo} ${d.partyName} ${d.projectName} ${d.siteName} ${d.vehicleNo}`.toLowerCase();
        return hay.includes(needle);
      });
  }, [dispatches, q, statusFilter, partyFilter]);

  const partyById = useMemo(() => new Map(parties.map((p) => [p.id, p])), [parties]);

  function persist(nextParties: Party[], nextDispatches: Dispatch[], nextSeq = seq) {
    setParties(nextParties);
    setDispatches(nextDispatches);
    setSeq(nextSeq);
    saveState(nextParties, nextDispatches, nextSeq);
  }

  function canCreate() {
    const p = partyById.get(partyId);
    if (!p) return false;
    if (!p.activeAccess) return false;
    if (!siteName.trim()) return false;
    if (!vehicleNo.trim()) return false;
    const m = clampNum(loadMT);
    if (m <= 0) return false;
    return true;
  }

  function onCreateDispatch() {
    if (!canCreate()) return;

    const p = partyById.get(partyId)!;
    const nextSeq = seq + 1;
    const challanNo = formatChallan(nextSeq);

    const d: Dispatch = {
      id: uid("disp"),
      challanNo,
      partyId: p.id,
      partyName: p.name,
      projectName: p.projectName,
      siteName: siteName.trim(),
      vehicleNo: safeUpper(vehicleNo),
      loadMT: clampNum(loadMT),
      createdAt: Date.now(),
      status: "DISPATCHED",
      notes: notes.trim() || undefined,
    };

    const nextDispatches = [d, ...dispatches];
    persist(parties, nextDispatches, nextSeq);

    setSiteName("");
    setLoadMT("");
    setVehicleNo("");
    setNotes("");

    pushLocalNotification(
      "ADMIN",
      "Dispatch created",
      `${d.challanNo} • ${d.partyName} • ${d.loadMT} MT • ${d.vehicleNo}`,
      { dispatchId: d.id, partyId: d.partyId },
    );
    pushLocalNotification(
      "SITE",
      "Truck dispatched",
      `${d.challanNo} is on the way. Vehicle: ${d.vehicleNo}`,
      { dispatchId: d.id, partyId: d.partyId },
    );
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

  function setPartyAccess(partyIdToUpdate: string, active: boolean) {
    const nextParties = parties.map((p) => (p.id === partyIdToUpdate ? { ...p, activeAccess: active } : p));
    persist(nextParties, dispatches);
  }

  function reconcileAndComplete(partyIdToUpdate: string) {
    const p = partyById.get(partyIdToUpdate);
    if (!p) return;
    const totals = getPartyTotals(dispatches, partyIdToUpdate);
    const nextParties = parties.map((x) =>
      x.id === partyIdToUpdate
        ? {
            ...x,
            reconciledMT: totals.received,
            invoicedMT: totals.received,
            activeAccess: false,
          }
        : x,
    );
    persist(nextParties, dispatches);
    pushLocalNotification("ADMIN", "Project completed", `${p.projectName} marked invoiced & link deactivated.`, {
      partyId: p.id,
    });
    pushLocalNotification("SITE", "Access closed", `${p.projectName} has been completed. This link is now inactive.`, {
      partyId: p.id,
    });
  }

  const notifCount = useMemo(() => {
    const key = "df_notifications";
    const prev = JSON.parse(localStorage.getItem(key) || "[]") as NotificationEvent[];
    return prev.filter((n) => n.side === "ADMIN").length;
  }, [dispatches, parties]);

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
                Dispatch + site acknowledgements • challans • progress
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:flex">
              <Activity className="h-4 w-4" />
              <span data-testid="text-active-count">{activeCount} active</span>
            </div>
            <Button
              variant="secondary"
              className="gap-2"
              data-testid="button-notifications"
              onClick={() => {
                const key = "df_notifications";
                const all = (JSON.parse(localStorage.getItem(key) || "[]") as NotificationEvent[]).slice(0, 8);
                toast("Recent updates", {
                  description: all.length
                    ? all
                        .map((n) => `${format(n.ts, "HH:mm")} • ${n.title}`)
                        .join("\n")
                    : "No notifications yet.",
                });
              }}
            >
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Updates</span>
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
                        Create a dispatch — challan number & time are auto-generated.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="hidden rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:block">
                  <div className="flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    <span data-testid="text-challan-format">DC-YYMM-00001</span>
                  </div>
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="party" data-testid="label-party">
                    Project / Party
                  </Label>
                  <Select value={partyId} onValueChange={setPartyId}>
                    <SelectTrigger id="party" data-testid="select-party">
                      <SelectValue placeholder="Select a party" />
                    </SelectTrigger>
                    <SelectContent>
                      {parties.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`select-item-party-${p.id}`}>
                          {p.projectName} — {p.name}
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
                    <Input
                      id="now"
                      readOnly
                      value={format(Date.now(), "dd MMM yyyy • HH:mm")}
                      data-testid="input-dispatch-time"
                    />
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
                    <div data-testid="text-site-link-rules">Site actions require name + timestamp is recorded.</div>
                  </div>
                  <Button
                    className="gap-2"
                    onClick={onCreateDispatch}
                    disabled={!canCreate()}
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
                    Projects & Access Links
                  </h2>
                  <p data-testid="text-parties-subtitle" className="text-sm text-muted-foreground">
                    Track cumulative dispatched quantity and control external link access.
                  </p>
                </div>
                <div className="hidden items-center gap-2 rounded-2xl border border-border/70 bg-card/70 px-3 py-2 text-xs text-muted-foreground shadow-sm md:flex">
                  <Shield className="h-4 w-4" />
                  Access control
                </div>
              </div>

              <Separator className="my-4" />

              <div className="space-y-4">
                {parties.map((p) => {
                  const totals = getPartyTotals(dispatches, p.id);
                  const pct = p.totalRequirementMT > 0 ? Math.min(100, (totals.dispatched / p.totalRequirementMT) * 100) : 0;
                  const url = `${shareBase}${p.accessId}`;

                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm"
                      data-testid={`card-party-${p.id}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div data-testid={`text-project-${p.id}`} className="font-medium">
                              {p.projectName}
                            </div>
                            <Badge className="df-pill" variant="secondary" data-testid={`badge-party-${p.id}`}>
                              {p.name}
                            </Badge>
                            {p.activeAccess ? (
                              <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20" data-testid={`badge-access-active-${p.id}`}>
                                Link active
                              </Badge>
                            ) : (
                              <Badge className="bg-slate-500/10 text-slate-700 border-slate-500/20" data-testid={`badge-access-inactive-${p.id}`}>
                                Link inactive
                              </Badge>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                            <div data-testid={`text-total-required-${p.id}`}>
                              Required: <span className="font-medium text-foreground">{p.totalRequirementMT} MT</span>
                            </div>
                            <div data-testid={`text-dispatched-${p.id}`}>
                              Dispatched: <span className="font-medium text-foreground">{totals.dispatched.toFixed(2)} MT</span>
                            </div>
                            <div data-testid={`text-received-${p.id}`}>
                              Received: <span className="font-medium text-foreground">{totals.received.toFixed(2)} MT</span>
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
                              <span data-testid={`text-progress-${p.id}`}>{pct.toFixed(0)}% of requirement dispatched</span>
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
                              disabled={!p.activeAccess}
                            >
                              <Link2 className="h-4 w-4" />
                              Copy link
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-2"
                              data-testid={`button-open-link-${p.id}`}
                              onClick={() => setLocation(`/site/${p.accessId}`)}
                              disabled={!p.activeAccess}
                            >
                              <MapPin className="h-4 w-4" />
                              Open
                            </Button>
                          </div>

                          <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card/70 px-3 py-2 text-xs">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <span data-testid={`text-access-toggle-${p.id}`}>Access</span>
                            </div>
                            <Switch
                              checked={p.activeAccess}
                              onCheckedChange={(v) => setPartyAccess(p.id, v)}
                              data-testid={`switch-access-${p.id}`}
                            />
                          </div>

                          <Button
                            className="mt-1 gap-2"
                            variant="destructive"
                            data-testid={`button-complete-${p.id}`}
                            onClick={() => reconcileAndComplete(p.id)}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Reconcile & complete
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
                    Live status, history, and quick reporting filters.
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
                        <SelectValue placeholder="Project" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL" data-testid="select-item-party-filter-all">
                          All projects
                        </SelectItem>
                        {parties.map((p) => (
                          <SelectItem key={p.id} value={p.id} data-testid={`select-item-party-filter-${p.id}`}>
                            {p.projectName}
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
                                <div
                                  data-testid={`text-challan-${d.id}`}
                                  className="font-mono text-xs text-muted-foreground"
                                >
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
                                  <span className="text-muted-foreground">Party:</span> {d.partyName}
                                </div>
                                <div data-testid={`text-site-${d.id}`} className="truncate">
                                  <span className="text-muted-foreground">Site:</span> {d.siteName}
                                </div>
                                <div data-testid={`text-project-${d.id}`} className="truncate">
                                  <span className="text-muted-foreground">Project:</span> {d.projectName}
                                </div>
                                <div data-testid={`text-load-${d.id}`}>
                                  <span className="text-muted-foreground">Load:</span> {d.loadMT.toFixed(2)} MT
                                </div>
                              </div>

                              <div className="mt-2 text-xs text-muted-foreground">
                                <span data-testid={`text-created-${d.id}`}>
                                  Dispatched {format(d.createdAt, "dd MMM • HH:mm")}
                                </span>
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
                                  if (!p?.activeAccess) {
                                    toast("Link inactive", { description: "This project has been completed / deactivated." });
                                    return;
                                  }
                                  setLocation(`/site/${p.accessId}`);
                                }}
                              >
                                <Link2 className="h-4 w-4" />
                                Site link
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
                      <div
                        className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center"
                        data-testid="empty-active"
                      >
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
                                  <span className="text-muted-foreground">{d.projectName}</span> — {d.partyName}
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
                      <div
                        className="rounded-2xl border border-dashed border-border/70 bg-card/40 p-10 text-center"
                        data-testid="empty-history"
                      >
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
                      const remaining = Math.max(0, p.totalRequirementMT - totals.dispatched);
                      return (
                        <div
                          key={p.id}
                          className="rounded-2xl border border-border/70 bg-card/60 p-4 shadow-sm"
                          data-testid={`card-report-${p.id}`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div data-testid={`text-report-project-${p.id}`} className="font-medium">
                                {p.projectName}
                              </div>
                              <div data-testid={`text-report-party-${p.id}`} className="text-xs text-muted-foreground">
                                {p.name}
                              </div>
                            </div>
                            <Badge className="df-pill" variant="secondary" data-testid={`badge-report-required-${p.id}`}>
                              Req {p.totalRequirementMT} MT
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
                            <div data-testid={`text-report-trips-${p.id}`}>
                              <span className="text-muted-foreground">Trips</span>
                              <div className="font-medium">{totals.count}</div>
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
                    Notifications (prototype)
                  </h2>
                  <p data-testid="text-demo-note" className="text-sm text-muted-foreground">
                    This mockup plays a sound + shows toasts. True push notifications across devices require backend.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  data-testid="button-test-sound"
                  onClick={() => {
                    beep();
                    toast("Test alert", { description: "Sound + toast (local prototype)." });
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
