import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  CheckCircle2,
  Copy,
  Download,
  Edit2,
  FileText,
  Filter,
  Home,
  Link2,
  Plus,
  Printer,
  Search,
  Settings,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

type PartyStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string | null;
  mixType: string;
  totalRequiredMT: string;
  status: PartyStatus;
  accessId: string;
  reconciledMT: string;
  invoicedMT: string;
  createdAt: string;
};

type Dispatch = {
  id: string;
  challanNo: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string | null;
  siteName: string;
  vehicleNo: string;
  loadMT: string;
  createdAt: string;
  status: "DISPATCHED" | "ARRIVED" | "LEFT";
  arrivedAt?: string | null;
  leftAt?: string | null;
  arrivedByName?: string | null;
  leftByName?: string | null;
  notes?: string | null;
};

const MIX_TYPES = ["DBM", "SDBC", "BC", "WMM", "GSB", "Other"];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 64);
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState("parties");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [mixTypeFilter, setMixTypeFilter] = useState<string>("all");
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showPartyDialog, setShowPartyDialog] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState({
    partyName: "",
    partyCode: "",
    orderRefNo: "",
    mixType: "DBM",
    totalRequiredMT: "",
  });

  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [plantPin, setPlantPin] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [currentOwnerPinForSettings, setCurrentOwnerPinForSettings] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState("");
  const [showOwnerPinDialog, setShowOwnerPinDialog] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ type: "party" | "dispatch"; id: string } | null>(null);

  useEffect(() => {
    const socket = io();
    
    socket.on("dispatch-status-updated", (data: {
      dispatch: {
        id: string;
        challanNo: string;
        status: string;
      };
      partyName: string;
      partyCode: string;
      newStatus: string;
      receiverName: string;
    }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      
      toast({
        title: `Dispatch ${data.dispatch.challanNo} - ${data.newStatus}`,
        description: `${data.partyName} (${data.partyCode}) - Acknowledged by ${data.receiverName}`,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, toast]);

  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [dispatchToDelete, setDispatchToDelete] = useState<Dispatch | null>(null);

  const { data: parties = [], isLoading: loadingParties } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
    queryFn: async () => {
      const res = await fetch("/api/parties");
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
  });

  const { data: dispatches = [], isLoading: loadingDispatches } = useQuery<Dispatch[]>({
    queryKey: ["/api/dispatches"],
    queryFn: async () => {
      const res = await fetch("/api/dispatches");
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
  });

  const createPartyMutation = useMutation({
    mutationFn: async (data: typeof partyForm) => {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          accessId: slugify(data.partyCode || data.partyName),
          status: "ACTIVE",
        }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create party");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
      setShowPartyDialog(false);
      resetPartyForm();
      toast({ title: "Success", description: "Party created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updatePartyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Party> }) => {
      const res = await fetch(`/api/parties/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update party");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
      setShowPartyDialog(false);
      setEditingParty(null);
      resetPartyForm();
      toast({ title: "Success", description: "Party updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deletePartyMutation = useMutation({
    mutationFn: async ({ id, ownerPin }: { id: string; ownerPin: string }) => {
      const res = await fetch(`/api/parties/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPin }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete party");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties"] });
      setPartyToDelete(null);
      toast({ title: "Success", description: "Party deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteDispatchMutation = useMutation({
    mutationFn: async ({ id, ownerPin }: { id: string; ownerPin: string }) => {
      const res = await fetch(`/api/dispatches/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPin }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete dispatch");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      toast({ title: "Success", description: "Dispatch deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetPartyForm() {
    setPartyForm({
      partyName: "",
      partyCode: "",
      orderRefNo: "",
      mixType: "DBM",
      totalRequiredMT: "",
    });
  }

  function openCreatePartyDialog() {
    setEditingParty(null);
    resetPartyForm();
    setShowPartyDialog(true);
  }

  function openEditPartyDialog(party: Party) {
    setEditingParty(party);
    setPartyForm({
      partyName: party.partyName,
      partyCode: party.partyCode,
      orderRefNo: party.orderRefNo || "",
      mixType: party.mixType || "DBM",
      totalRequiredMT: party.totalRequiredMT,
    });
    setShowPartyDialog(true);
  }

  function handlePartySubmit() {
    if (!partyForm.partyName || !partyForm.partyCode || !partyForm.totalRequiredMT) {
      toast({ title: "Validation Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }

    if (editingParty) {
      updatePartyMutation.mutate({
        id: editingParty.id,
        data: {
          partyName: partyForm.partyName,
          orderRefNo: partyForm.orderRefNo || null,
          mixType: partyForm.mixType,
          totalRequiredMT: partyForm.totalRequiredMT,
        },
      });
    } else {
      createPartyMutation.mutate(partyForm);
    }
  }

  function handleToggleStatus(party: Party) {
    const newStatus = party.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    updatePartyMutation.mutate({ id: party.id, data: { status: newStatus } });
  }

  function handleReconcile(party: Party) {
    const totals = getPartyTotals(party.id);
    updatePartyMutation.mutate({
      id: party.id,
      data: {
        status: "CLOSED",
        reconciledMT: String(totals.dispatched),
        invoicedMT: String(totals.dispatched),
      },
    });
  }

  function getPartyTotals(partyId: string) {
    const partyDispatches = dispatches.filter((d) => d.partyId === partyId);
    const dispatched = partyDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
    const arrived = partyDispatches.filter((d) => d.status === "ARRIVED" || d.status === "LEFT").reduce((sum, d) => sum + Number(d.loadMT), 0);
    const completed = partyDispatches.filter((d) => d.status === "LEFT").reduce((sum, d) => sum + Number(d.loadMT), 0);
    return { dispatched, arrived, completed, count: partyDispatches.length };
  }

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {}
    setLocation("/");
  }

  async function handleSaveSettings() {
    if (!currentOwnerPinForSettings) {
      toast({ title: "Error", description: "Current Owner PIN is required", variant: "destructive" });
      return;
    }

    if (!adminPin && !plantPin && !ownerPin) {
      toast({ title: "Error", description: "Enter at least one new PIN to change", variant: "destructive" });
      return;
    }

    setSavingSettings(true);
    try {
      const errors: string[] = [];

      if (adminPin) {
        const res = await fetch("/api/settings/admin_pin", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: adminPin, ownerPin: currentOwnerPinForSettings }),
        });
        if (!res.ok) {
          const error = await res.json();
          errors.push(error.error || "Failed to update Admin PIN");
        }
      }
      if (plantPin) {
        const res = await fetch("/api/settings/plant_pin", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: plantPin, ownerPin: currentOwnerPinForSettings }),
        });
        if (!res.ok) {
          const error = await res.json();
          errors.push(error.error || "Failed to update Plant PIN");
        }
      }
      if (ownerPin) {
        const res = await fetch("/api/settings/owner_pin", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: ownerPin, ownerPin: currentOwnerPinForSettings }),
        });
        if (!res.ok) {
          const error = await res.json();
          errors.push(error.error || "Failed to update Owner PIN");
        }
      }

      if (errors.length > 0) {
        toast({ title: "Error", description: errors[0], variant: "destructive" });
      } else {
        toast({ title: "Success", description: "Settings saved successfully" });
        setShowSettingsDialog(false);
        setAdminPin("");
        setPlantPin("");
        setOwnerPin("");
        setCurrentOwnerPinForSettings("");
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    } finally {
      setSavingSettings(false);
    }
  }

  async function verifyOwnerPin() {
    try {
      if (pendingDeleteAction?.type === "party") {
        deletePartyMutation.mutate({ id: pendingDeleteAction.id, ownerPin: ownerPinInput });
      } else if (pendingDeleteAction?.type === "dispatch") {
        deleteDispatchMutation.mutate({ id: pendingDeleteAction.id, ownerPin: ownerPinInput });
      }
      setShowOwnerPinDialog(false);
      setOwnerPinInput("");
      setPendingDeleteAction(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  }

  function requestDeleteParty(party: Party) {
    setPendingDeleteAction({ type: "party", id: party.id });
    setPartyToDelete(party);
    setShowOwnerPinDialog(true);
  }

  function requestDeleteDispatch(dispatch: Dispatch) {
    setPendingDeleteAction({ type: "dispatch", id: dispatch.id });
    setDispatchToDelete(dispatch);
    setShowOwnerPinDialog(true);
  }

  function copyLink(accessId: string) {
    const url = `${window.location.origin}/site/${accessId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast({ title: "Link copied", description: url });
    });
  }

  const filteredParties = useMemo(() => {
    return parties.filter((p) => {
      const matchesSearch =
        !searchQuery ||
        p.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.partyCode.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      const matchesMixType = mixTypeFilter === "all" || p.mixType === mixTypeFilter;
      return matchesSearch && matchesStatus && matchesMixType;
    });
  }, [parties, searchQuery, statusFilter, mixTypeFilter]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const matchesSearch =
        !searchQuery ||
        d.challanNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase());
      
      const party = parties.find((p) => p.id === d.partyId);
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesMixType = mixTypeFilter === "all" || (party && party.mixType === mixTypeFilter);
      const matchesParty = partyFilter === "all" || d.partyId === partyFilter;

      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && new Date(d.createdAt) >= new Date(dateFrom);
      }
      if (dateTo) {
        matchesDate = matchesDate && new Date(d.createdAt) <= new Date(dateTo + "T23:59:59");
      }

      return matchesSearch && matchesStatus && matchesMixType && matchesParty && matchesDate;
    });
  }, [dispatches, parties, searchQuery, statusFilter, mixTypeFilter, partyFilter, dateFrom, dateTo]);

  const summaryStats = useMemo(() => {
    const totalParties = parties.length;
    const activeParties = parties.filter((p) => p.status === "ACTIVE").length;
    const totalDispatched = dispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
    const pendingAcknowledgement = dispatches.filter((d) => d.status === "DISPATCHED").length;
    return { totalParties, activeParties, totalDispatched, pendingAcknowledgement };
  }, [parties, dispatches]);

  async function exportToExcel() {
    const XLSX = await import("xlsx");
    
    const headers = ["Challan No", "Party", "Mix Type", "Site", "Vehicle", "Load (MT)", "Date", "Status", "Arrived By", "Left By"];
    const rows = filteredDispatches.map((d) => {
      const party = parties.find((p) => p.id === d.partyId);
      return [
        d.challanNo,
        d.partyName,
        party?.mixType || "",
        d.siteName,
        d.vehicleNo,
        Number(d.loadMT),
        format(new Date(d.createdAt), "dd/MM/yyyy HH:mm"),
        d.status,
        d.arrivedByName || "",
        d.leftByName || "",
      ];
    });

    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatches");
    
    XLSX.writeFile(workbook, `dispatches_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`);
  }

  function handlePrint() {
    window.print();
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Command Center</h1>
            <p className="text-sm text-gray-500">Dispatch Management System</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowSettingsDialog(true)} data-testid="button-settings">
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </Button>
            <Button variant="outline" onClick={handleLogout} data-testid="button-home">
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold" data-testid="stat-total-parties">{summaryStats.totalParties}</div>
              <p className="text-sm text-gray-500">Total Parties</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600" data-testid="stat-active-parties">{summaryStats.activeParties}</div>
              <p className="text-sm text-gray-500">Active Parties</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold" data-testid="stat-total-dispatched">{summaryStats.totalDispatched.toFixed(2)} MT</div>
              <p className="text-sm text-gray-500">Total Dispatched</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-orange-600" data-testid="stat-pending">{summaryStats.pendingAcknowledgement}</div>
              <p className="text-sm text-gray-500">Pending Acknowledgement</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="parties" data-testid="tab-parties">
              <Users className="h-4 w-4 mr-2" />
              Parties
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">
              <FileText className="h-4 w-4 mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>

          <TabsContent value="parties" className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search parties..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64"
                    data-testid="input-search-parties"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-32" data-testid="select-status-filter">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="INACTIVE">Inactive</SelectItem>
                    <SelectItem value="CLOSED">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={mixTypeFilter} onValueChange={setMixTypeFilter}>
                  <SelectTrigger className="w-32" data-testid="select-mix-filter">
                    <SelectValue placeholder="Mix Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {MIX_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={openCreatePartyDialog} data-testid="button-add-party">
                <Plus className="h-4 w-4 mr-2" />
                Add Party
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Party Name</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Mix Type</TableHead>
                    <TableHead>Order Ref</TableHead>
                    <TableHead>Required (MT)</TableHead>
                    <TableHead>Dispatched (MT)</TableHead>
                    <TableHead>Balance (MT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-gray-500 py-8">
                        No parties found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredParties.map((party) => {
                      const totals = getPartyTotals(party.id);
                      const balance = Number(party.totalRequiredMT) - totals.dispatched;
                      return (
                        <TableRow key={party.id} data-testid={`row-party-${party.id}`}>
                          <TableCell className="font-medium">{party.partyName}</TableCell>
                          <TableCell>{party.partyCode}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{party.mixType || "DBM"}</Badge>
                          </TableCell>
                          <TableCell>{party.orderRefNo || "-"}</TableCell>
                          <TableCell>{Number(party.totalRequiredMT).toFixed(2)}</TableCell>
                          <TableCell>{totals.dispatched.toFixed(2)}</TableCell>
                          <TableCell className={balance < 0 ? "text-red-600" : ""}>
                            {balance.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={party.status === "ACTIVE" ? "default" : party.status === "CLOSED" ? "secondary" : "outline"}
                            >
                              {party.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyLink(party.accessId)}
                                title="Copy site link"
                                data-testid={`button-copy-link-${party.id}`}
                              >
                                <Link2 className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => openEditPartyDialog(party)}
                                title="Edit"
                                data-testid={`button-edit-${party.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Switch
                                checked={party.status === "ACTIVE"}
                                onCheckedChange={() => handleToggleStatus(party)}
                                disabled={party.status === "CLOSED"}
                                data-testid={`switch-active-${party.id}`}
                              />
                              {party.status !== "CLOSED" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleReconcile(party)}
                                  title="Reconcile & Close"
                                  data-testid={`button-reconcile-${party.id}`}
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => requestDeleteParty(party)}
                                title="Delete"
                                className="text-red-600 hover:text-red-700"
                                data-testid={`button-delete-${party.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Filters
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  <div>
                    <Label>Search</Label>
                    <Input
                      placeholder="Challan, party, vehicle..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      data-testid="input-report-search"
                    />
                  </div>
                  <div>
                    <Label>Date From</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="input-date-from"
                    />
                  </div>
                  <div>
                    <Label>Date To</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="input-date-to"
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger data-testid="select-report-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="DISPATCHED">Dispatched</SelectItem>
                        <SelectItem value="ARRIVED">Arrived</SelectItem>
                        <SelectItem value="LEFT">Left</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Mix Type</Label>
                    <Select value={mixTypeFilter} onValueChange={setMixTypeFilter}>
                      <SelectTrigger data-testid="select-report-mix">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        {MIX_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Party</Label>
                    <Select value={partyFilter} onValueChange={setPartyFilter}>
                      <SelectTrigger data-testid="select-report-party">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Parties</SelectItem>
                        {parties.map((party) => (
                          <SelectItem key={party.id} value={party.id}>{party.partyName} ({party.partyCode})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel">
                    <Download className="h-4 w-4 mr-2" />
                    Export Excel
                  </Button>
                  <Button variant="outline" onClick={handlePrint} data-testid="button-print">
                    <Printer className="h-4 w-4 mr-2" />
                    Print
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dispatch Report</CardTitle>
                <CardDescription>
                  Showing {filteredDispatches.length} of {dispatches.length} dispatches
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Challan No</TableHead>
                      <TableHead>Party</TableHead>
                      <TableHead>Mix Type</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Vehicle</TableHead>
                      <TableHead>Load (MT)</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Arrived By</TableHead>
                      <TableHead>Left By</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDispatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-gray-500 py-8">
                          No dispatches found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDispatches.map((dispatch) => {
                        const party = parties.find((p) => p.id === dispatch.partyId);
                        return (
                          <TableRow key={dispatch.id} data-testid={`row-dispatch-${dispatch.id}`}>
                            <TableCell className="font-medium">{dispatch.challanNo}</TableCell>
                            <TableCell>{dispatch.partyName}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{party?.mixType || "DBM"}</Badge>
                            </TableCell>
                            <TableCell>{dispatch.siteName}</TableCell>
                            <TableCell>{dispatch.vehicleNo}</TableCell>
                            <TableCell>{Number(dispatch.loadMT).toFixed(2)}</TableCell>
                            <TableCell>{format(new Date(dispatch.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  dispatch.status === "LEFT"
                                    ? "default"
                                    : dispatch.status === "ARRIVED"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {dispatch.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{dispatch.arrivedByName || "-"}</TableCell>
                            <TableCell>{dispatch.leftByName || "-"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => requestDeleteDispatch(dispatch)}
                                data-testid={`button-delete-dispatch-${dispatch.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={showPartyDialog} onOpenChange={setShowPartyDialog}>
        <DialogContent data-testid="dialog-party">
          <DialogHeader>
            <DialogTitle>{editingParty ? "Edit Party" : "Add New Party"}</DialogTitle>
            <DialogDescription>
              {editingParty ? "Update party details" : "Create a new party/order"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="partyName">Party Name *</Label>
                <Input
                  id="partyName"
                  value={partyForm.partyName}
                  onChange={(e) => setPartyForm({ ...partyForm, partyName: e.target.value })}
                  placeholder="Enter party name"
                  data-testid="input-party-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partyCode">Party Code *</Label>
                <Input
                  id="partyCode"
                  value={partyForm.partyCode}
                  onChange={(e) => setPartyForm({ ...partyForm, partyCode: e.target.value.toUpperCase() })}
                  placeholder="e.g., ABC123"
                  disabled={!!editingParty}
                  data-testid="input-party-code"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mixType">Mix Type *</Label>
                <Select
                  value={partyForm.mixType}
                  onValueChange={(v) => setPartyForm({ ...partyForm, mixType: v })}
                >
                  <SelectTrigger data-testid="select-mix-type">
                    <SelectValue placeholder="Select mix type" />
                  </SelectTrigger>
                  <SelectContent>
                    {MIX_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="totalRequiredMT">Total Required (MT) *</Label>
                <Input
                  id="totalRequiredMT"
                  type="number"
                  step="0.01"
                  value={partyForm.totalRequiredMT}
                  onChange={(e) => setPartyForm({ ...partyForm, totalRequiredMT: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-total-required"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="orderRefNo">Order Reference No</Label>
              <Input
                id="orderRefNo"
                value={partyForm.orderRefNo}
                onChange={(e) => setPartyForm({ ...partyForm, orderRefNo: e.target.value })}
                placeholder="Optional reference number"
                data-testid="input-order-ref"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartyDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePartySubmit}
              disabled={createPartyMutation.isPending || updatePartyMutation.isPending}
              data-testid="button-save-party"
            >
              {editingParty ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSettingsDialog} onOpenChange={(open) => {
        if (!open) {
          setAdminPin("");
          setPlantPin("");
          setOwnerPin("");
          setCurrentOwnerPinForSettings("");
        }
        setShowSettingsDialog(open);
      }}>
        <DialogContent data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Change PINs (Owner verification required)</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 border-b pb-4">
              <Label htmlFor="currentOwnerPinForSettings" className="font-semibold">Current Owner PIN *</Label>
              <Input
                id="currentOwnerPinForSettings"
                type="password"
                value={currentOwnerPinForSettings}
                onChange={(e) => setCurrentOwnerPinForSettings(e.target.value)}
                placeholder="Enter current Owner PIN to authorize"
                data-testid="input-current-owner-pin"
              />
              <p className="text-xs text-muted-foreground">Required to make any PIN changes</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPin">New Admin PIN</Label>
              <Input
                id="adminPin"
                type="password"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value)}
                placeholder="Leave empty to keep current"
                data-testid="input-admin-pin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plantPin">New Plant PIN</Label>
              <Input
                id="plantPin"
                type="password"
                value={plantPin}
                onChange={(e) => setPlantPin(e.target.value)}
                placeholder="Leave empty to keep current"
                data-testid="input-plant-pin"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ownerPin">New Owner PIN</Label>
              <Input
                id="ownerPin"
                type="password"
                value={ownerPin}
                onChange={(e) => setOwnerPin(e.target.value)}
                placeholder="Leave empty to keep current"
                data-testid="input-owner-pin"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings || !currentOwnerPinForSettings} data-testid="button-save-settings">
              {savingSettings ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOwnerPinDialog} onOpenChange={(open) => { if (!open) { setShowOwnerPinDialog(false); setOwnerPinInput(""); setPendingDeleteAction(null); } }}>
        <DialogContent data-testid="dialog-owner-pin">
          <DialogHeader>
            <DialogTitle>Owner Verification Required</DialogTitle>
            <DialogDescription>
              Enter Owner PIN to {pendingDeleteAction?.type === "party" ? `delete party "${partyToDelete?.partyName}"` : `delete dispatch "${dispatchToDelete?.challanNo}"`}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ownerPinInput">Owner PIN</Label>
              <Input
                id="ownerPinInput"
                type="password"
                value={ownerPinInput}
                onChange={(e) => setOwnerPinInput(e.target.value)}
                placeholder="Enter Owner PIN"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && verifyOwnerPin()}
                data-testid="input-owner-pin-verify"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowOwnerPinDialog(false); setOwnerPinInput(""); setPendingDeleteAction(null); }}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={verifyOwnerPin} disabled={!ownerPinInput} data-testid="button-verify-owner-pin">
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
