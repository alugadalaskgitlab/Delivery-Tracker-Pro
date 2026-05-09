import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import {
  Bell,
  CheckCircle2,
  Columns3,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileText,
  Filter,
  Home,
  Link2,
  MapPin,
  MessageSquare,
  Plus,
  Printer,
  Search,
  Settings,
  Trash2,
  Truck,
  Users,
  X,
} from "lucide-react";
import { playNewDispatchSound, playStatusUpdateSound, initializeAudioContext } from "@/lib/sounds";
import { format } from "date-fns";
import * as XLSX from "xlsx";
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
import CompanyHeader from "@/components/CompanyHeader";
import { NotificationToggle } from "@/components/NotificationToggle";

type PartyStatus = "ACTIVE" | "INACTIVE" | "CLOSED";

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  address?: string | null;
  gstNo?: string | null;
  panNo?: string | null;
  status: PartyStatus;
  accessId: string;
  createdAt: string;
};

type Site = {
  id: string;
  partyId: string;
  siteCode: string;
  siteName: string;
  mixType: string;
  orderedMT: string;
  accessId: string;
  status: string;
  notifyMobile?: string | null;
  createdAt: string;
};

type Dispatch = {
  id: string;
  challanNo: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  siteId?: string | null;
  siteCode?: string | null;
  siteName: string;
  mixType?: string | null;
  vehicleNo: string;
  driverName?: string | null;
  driverMobile?: string | null;
  loadMT: string;
  createdAt: string;
  status: "DISPATCHED" | "ARRIVED" | "UNLOADED";
  arrivedAt?: string | null;
  leftAt?: string | null;
  arrivedByName?: string | null;
  leftByName?: string | null;
  notes?: string | null;
};

const MIX_TYPES = ["DBM", "SDBC", "BC", "WMM", "GSB", "Other"];

const REPORT_COLUMNS = [
  { key: "challanNo",    label: "Challan No",       defaultEnabled: true  },
  { key: "party",        label: "Party",             defaultEnabled: true  },
  { key: "site",         label: "Site",              defaultEnabled: true  },
  { key: "mixType",      label: "Mix Type",          defaultEnabled: true  },
  { key: "vehicle",      label: "Vehicle",           defaultEnabled: true  },
  { key: "driverName",   label: "Driver Name",       defaultEnabled: true  },
  { key: "driverMobile", label: "Driver Mobile",     defaultEnabled: false },
  { key: "loadMT",       label: "Load (MT)",         defaultEnabled: true  },
  { key: "dispatchedAt", label: "Dispatched At",     defaultEnabled: true  },
  { key: "status",       label: "Status",            defaultEnabled: true  },
  { key: "arrivedAt",    label: "Arrived At",        defaultEnabled: false },
  { key: "unloadedAt",   label: "Unloaded At",       defaultEnabled: false },
  { key: "receivedBy",   label: "Received By",       defaultEnabled: false },
  { key: "releasedBy",   label: "Truck Released By", defaultEnabled: false },
] as const;

type ReportColumnKey = typeof REPORT_COLUMNS[number]["key"];

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
  const [partyFilter, setPartyFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [showPartyDialog, setShowPartyDialog] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);
  const [partyForm, setPartyForm] = useState({
    partyName: "",
    partyCode: "",
    address: "",
    gstNo: "",
    panNo: "",
  });
  const [siteFilterReports, setSiteFilterReports] = useState<string>("all");
  const [columnVisibility, setColumnVisibility] = useState<Record<ReportColumnKey, boolean>>(
    () => Object.fromEntries(REPORT_COLUMNS.map(c => [c.key, c.defaultEnabled])) as Record<ReportColumnKey, boolean>
  );
  const [showColumnChooser, setShowColumnChooser] = useState(false);

  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [plantPin, setPlantPin] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [currentOwnerPinForSettings, setCurrentOwnerPinForSettings] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const [smsAccountSid, setSmsAccountSid] = useState("");
  const [smsAuthToken, setSmsAuthToken] = useState("");
  const [smsFromNumber, setSmsFromNumber] = useState("");
  const [smsAuthTokenSet, setSmsAuthTokenSet] = useState(false);
  const [showSmsAuthToken, setShowSmsAuthToken] = useState(false);
  const [smsTestNumber, setSmsTestNumber] = useState("");
  const [savingSmsConfig, setSavingSmsConfig] = useState(false);
  const [sendingTestSms, setSendingTestSms] = useState(false);
  const [smsConfigDirty, setSmsConfigDirty] = useState(false);
  const [ownerPinInput, setOwnerPinInput] = useState("");
  const [showOwnerPinDialog, setShowOwnerPinDialog] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<{ type: "party" | "dispatch"; id: string } | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<{ partyId: string; newStatus: PartyStatus } | null>(null);
  const [editingDispatch, setEditingDispatch] = useState<Dispatch | null>(null);
  const [editDispatchForm, setEditDispatchForm] = useState({ vehicleNo: "", loadMT: "", notes: "", driverName: "", driverMobile: "" });
  const [editDispatchOwnerPin, setEditDispatchOwnerPin] = useState("");

  useEffect(() => {
    initializeAudioContext();
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
      playStatusUpdateSound();
      
      toast({
        title: `Dispatch ${data.dispatch.challanNo} - ${data.newStatus}`,
        description: `${data.partyName} (${data.partyCode}) - Acknowledged by ${data.receiverName}`,
      });
    });

    socket.on("new-dispatch", (data: {
      dispatch: { challanNo: string };
      partyName: string;
      partyCode: string;
    }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      playNewDispatchSound();
      
      toast({
        title: `New Dispatch Created`,
        description: `${data.dispatch.challanNo} - ${data.partyName} (${data.partyCode})`,
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, toast]);

  const [partyToDelete, setPartyToDelete] = useState<Party | null>(null);
  const [dispatchToDelete, setDispatchToDelete] = useState<Dispatch | null>(null);
  const [managingSitesParty, setManagingSitesParty] = useState<Party | null>(null);
  const [newSiteName, setNewSiteName] = useState("");
  const [newSiteMixType, setNewSiteMixType] = useState("DBM");
  const [newSiteOrderedMT, setNewSiteOrderedMT] = useState("");
  const [newSiteNotifyMobile, setNewSiteNotifyMobile] = useState("");
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [editSiteName, setEditSiteName] = useState("");
  const [editSiteCode, setEditSiteCode] = useState("");
  const [editSiteMixType, setEditSiteMixType] = useState("DBM");
  const [editSiteOrderedMT, setEditSiteOrderedMT] = useState("");
  const [editSiteNotifyMobile, setEditSiteNotifyMobile] = useState("");
  const [editSiteOwnerPin, setEditSiteOwnerPin] = useState("");

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
          partyName: data.partyName.toUpperCase(),
          address: data.address?.toUpperCase() || null,
          gstNo: data.gstNo?.toUpperCase() || null,
          panNo: data.panNo?.toUpperCase() || null,
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

  const editDispatchMutation = useMutation({
    mutationFn: async ({ id, ownerPin, vehicleNo, loadMT, notes, driverName, driverMobile }: { id: string; ownerPin: string; vehicleNo: string; loadMT: string; notes: string; driverName?: string; driverMobile?: string }) => {
      const res = await fetch(`/api/dispatches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPin, vehicleNo, loadMT, notes, driverName, driverMobile }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to edit dispatch");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      setEditingDispatch(null);
      setEditDispatchOwnerPin("");
      toast({ title: "Success", description: "Dispatch updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: partySites = [] } = useQuery<Site[]>({
    queryKey: ["/api/parties", managingSitesParty?.id, "sites"],
    queryFn: async () => {
      if (!managingSitesParty) return [];
      const res = await fetch(`/api/parties/${managingSitesParty.id}/sites`);
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    enabled: !!managingSitesParty,
  });

  const { data: allSites = [] } = useQuery<Site[]>({
    queryKey: ["/api/sites/all"],
    queryFn: async () => {
      const res = await fetch("/api/sites/all");
      if (!res.ok) throw new Error("Failed to fetch all sites");
      return res.json();
    },
  });

  const siteSummaryData = useMemo(() => {
    return allSites.map((site) => {
      const party = parties.find((p) => p.id === site.partyId);
      const siteDispatches = dispatches.filter((d) => d.siteId === site.id);
      const dispatchedMT = siteDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
      const orderedMT = Number(site.orderedMT);
      const balanceMT = orderedMT - dispatchedMT;
      return {
        id: site.id,
        partyId: site.partyId,
        partyName: party?.partyName || "Unknown",
        partyCode: party?.partyCode || "-",
        siteName: site.siteName,
        siteCode: site.siteCode,
        mixType: site.mixType,
        orderedMT,
        dispatchedMT,
        balanceMT,
      };
    });
  }, [allSites, parties, dispatches]);

  const createSiteMutation = useMutation({
    mutationFn: async ({ partyId, siteName, mixType, orderedMT, notifyMobile }: { partyId: string; siteName: string; mixType: string; orderedMT: string; notifyMobile?: string }) => {
      const res = await fetch(`/api/parties/${partyId}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteName, mixType, orderedMT: orderedMT || "0", notifyMobile }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create site");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties", managingSitesParty?.id, "sites"] });
      setNewSiteName("");
      setNewSiteMixType("DBM");
      setNewSiteOrderedMT("");
      setNewSiteNotifyMobile("");
      toast({ title: "Success", description: "Site added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async ({ id, ownerPin }: { id: string; ownerPin: string }) => {
      const res = await fetch(`/api/sites/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPin }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to delete site");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties", managingSitesParty?.id, "sites"] });
      toast({ title: "Success", description: "Site deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateSiteMutation = useMutation({
    mutationFn: async ({ id, ownerPin, siteName, siteCode, mixType, orderedMT, status, notifyMobile }: { 
      id: string; 
      ownerPin: string; 
      siteName?: string; 
      siteCode?: string;
      mixType?: string; 
      orderedMT?: string;
      status?: string;
      notifyMobile?: string;
    }) => {
      const res = await fetch(`/api/sites/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerPin, siteName, siteCode, mixType, orderedMT, status, notifyMobile }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update site");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/parties", managingSitesParty?.id, "sites"] });
      setEditingSite(null);
      setEditSiteOwnerPin("");
      toast({ title: "Success", description: "Site updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  function resetPartyForm() {
    setPartyForm({
      partyName: "",
      partyCode: "",
      address: "",
      gstNo: "",
      panNo: "",
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
      address: party.address || "",
      gstNo: party.gstNo || "",
      panNo: party.panNo || "",
    });
    setShowPartyDialog(true);
  }

  function handlePartySubmit() {
    if (!partyForm.partyName) {
      toast({ title: "Validation Error", description: "Party name is required", variant: "destructive" });
      return;
    }

    if (editingParty) {
      updatePartyMutation.mutate({
        id: editingParty.id,
        data: {
          partyName: partyForm.partyName.toUpperCase(),
          partyCode: partyForm.partyCode.toUpperCase(),
          address: partyForm.address?.toUpperCase() || null,
          gstNo: partyForm.gstNo?.toUpperCase() || null,
          panNo: partyForm.panNo?.toUpperCase() || null,
        },
      });
    } else {
      createPartyMutation.mutate({
        partyName: partyForm.partyName.toUpperCase(),
        address: partyForm.address?.toUpperCase() || "",
        gstNo: partyForm.gstNo?.toUpperCase() || "",
        panNo: partyForm.panNo?.toUpperCase() || "",
      });
    }
  }

  function handleToggleStatus(party: Party) {
    // For CLOSED parties, toggle to ACTIVE; otherwise toggle between ACTIVE/INACTIVE
    const newStatus = party.status === "CLOSED" ? "ACTIVE" : (party.status === "ACTIVE" ? "INACTIVE" : "ACTIVE");
    setPendingStatusAction({ partyId: party.id, newStatus });
    setShowOwnerPinDialog(true);
  }

  function handleReconcile(party: Party) {
    setPendingStatusAction({ partyId: party.id, newStatus: "CLOSED" });
    setShowOwnerPinDialog(true);
  }

  function getPartyTotals(partyId: string) {
    const partyDispatches = dispatches.filter((d) => d.partyId === partyId);
    const dispatched = partyDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
    const arrived = partyDispatches.filter((d) => d.status === "ARRIVED" || d.status === "UNLOADED").reduce((sum, d) => sum + Number(d.loadMT), 0);
    const completed = partyDispatches.filter((d) => d.status === "UNLOADED").reduce((sum, d) => sum + Number(d.loadMT), 0);
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

  async function fetchSmsConfig() {
    try {
      const res = await fetch("/api/admin/sms/config");
      if (res.ok) {
        const data = await res.json();
        setSmsAccountSid(data.accountSid || "");
        setSmsFromNumber(data.fromNumber || "");
        setSmsAuthTokenSet(data.authTokenSet || false);
        setSmsAuthToken("");
        setSmsConfigDirty(false);
      }
    } catch {}
  }

  async function handleSaveSmsConfig() {
    if (!smsAccountSid.trim() || !smsFromNumber.trim()) {
      toast({ title: "Error", description: "Account SID and From Number are required", variant: "destructive" });
      return;
    }
    if (!smsAuthToken.trim() && !smsAuthTokenSet) {
      toast({ title: "Error", description: "Auth Token is required", variant: "destructive" });
      return;
    }
    setSavingSmsConfig(true);
    try {
      const payload: Record<string, string> = {
        accountSid: smsAccountSid.trim(),
        fromNumber: smsFromNumber.trim(),
      };
      if (smsAuthToken.trim()) {
        payload.authToken = smsAuthToken.trim();
      }
      const res = await fetch("/api/admin/sms/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast({ title: "Saved", description: "SMS configuration saved successfully" });
        setSmsAuthToken("");
        setSmsAuthTokenSet(true);
        setSmsConfigDirty(false);
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.error || "Failed to save configuration", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save SMS configuration", variant: "destructive" });
    } finally {
      setSavingSmsConfig(false);
    }
  }

  async function handleTestSms() {
    if (!smsTestNumber.trim()) {
      toast({ title: "Error", description: "Please enter a phone number to send the test message to", variant: "destructive" });
      return;
    }
    setSendingTestSms(true);
    try {
      const res = await fetch("/api/admin/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toNumber: smsTestNumber.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: "Test sent!", description: data.message });
      } else {
        toast({ title: "Test failed", description: data.error || "Failed to send test message", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to send test message", variant: "destructive" });
    } finally {
      setSendingTestSms(false);
    }
  }

  async function verifyOwnerPin() {
    try {
      // First verify the PIN
      const verifyResponse = await fetch("/api/auth/verify-owner-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: ownerPinInput }),
        credentials: "include",
      });
      
      if (!verifyResponse.ok) {
        const error = await verifyResponse.json();
        toast({ title: "Error", description: error.error || "Invalid Owner PIN", variant: "destructive" });
        return;
      }
      
      // Handle delete actions
      if (pendingDeleteAction?.type === "party") {
        deletePartyMutation.mutate({ id: pendingDeleteAction.id, ownerPin: ownerPinInput });
      } else if (pendingDeleteAction?.type === "dispatch") {
        deleteDispatchMutation.mutate({ id: pendingDeleteAction.id, ownerPin: ownerPinInput });
      }
      
      // Handle status change actions
      if (pendingStatusAction) {
        updatePartyMutation.mutate({ id: pendingStatusAction.partyId, data: { status: pendingStatusAction.newStatus } });
      }
      
      setShowOwnerPinDialog(false);
      setOwnerPinInput("");
      setPendingDeleteAction(null);
      setPendingStatusAction(null);
    } catch (error) {
      toast({ title: "Error", description: "Failed to verify PIN", variant: "destructive" });
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

  function openEditDispatchDialog(dispatch: Dispatch) {
    setEditingDispatch(dispatch);
    setEditDispatchForm({
      vehicleNo: dispatch.vehicleNo,
      loadMT: dispatch.loadMT,
      notes: dispatch.notes || "",
      driverName: dispatch.driverName || "",
      driverMobile: dispatch.driverMobile || "",
    });
    setEditDispatchOwnerPin("");
  }

  function handleEditDispatchSubmit() {
    if (!editingDispatch || !editDispatchOwnerPin) return;
    editDispatchMutation.mutate({
      id: editingDispatch.id,
      ownerPin: editDispatchOwnerPin,
      vehicleNo: editDispatchForm.vehicleNo,
      loadMT: editDispatchForm.loadMT,
      notes: editDispatchForm.notes,
      driverName: editDispatchForm.driverName,
      driverMobile: editDispatchForm.driverMobile,
    });
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
      return matchesSearch && matchesStatus;
    });
  }, [parties, searchQuery, statusFilter]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((d) => {
      const matchesSearch =
        !searchQuery ||
        d.challanNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.partyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        d.vehicleNo.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || d.status === statusFilter;
      const matchesParty = partyFilter === "all" || d.partyId === partyFilter;
      const matchesSite = siteFilterReports === "all" || d.siteId === siteFilterReports;

      let matchesDate = true;
      if (dateFrom) {
        matchesDate = matchesDate && new Date(d.createdAt) >= new Date(dateFrom);
      }
      if (dateTo) {
        matchesDate = matchesDate && new Date(d.createdAt) <= new Date(dateTo + "T23:59:59");
      }

      return matchesSearch && matchesStatus && matchesParty && matchesSite && matchesDate;
    });
  }, [dispatches, searchQuery, statusFilter, partyFilter, siteFilterReports, dateFrom, dateTo]);

  const uniqueSitesForFilter = useMemo(() => {
    const filteredSites = partyFilter === "all" 
      ? allSites 
      : allSites.filter((s) => s.partyId === partyFilter);
    return filteredSites.map(s => ({ id: s.id, siteName: s.siteName, siteCode: s.siteCode }));
  }, [allSites, partyFilter]);

  useEffect(() => {
    setSiteFilterReports("all");
  }, [partyFilter]);

  const summaryStats = useMemo(() => {
    const totalParties = parties.length;
    const activeParties = parties.filter((p) => p.status === "ACTIVE").length;
    const totalDispatched = dispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
    const pendingAcknowledgement = dispatches.filter((d) => d.status === "DISPATCHED").length;
    return { totalParties, activeParties, totalDispatched, pendingAcknowledgement };
  }, [parties, dispatches]);

  function exportToExcel() {
    const selectedCount = REPORT_COLUMNS.filter(c => columnVisibility[c.key]).length;
    if (selectedCount === 0) {
      toast({ title: "No columns selected", description: "Please select at least one column before exporting.", variant: "destructive" });
      setShowColumnChooser(true);
      return;
    }
    const dateRangeStr = dateFrom || dateTo 
      ? `Date: ${dateFrom || "Start"} to ${dateTo || "Today"}`
      : `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
    
    const partyInfo = partyFilter !== "all" 
      ? parties.find(p => p.id === partyFilter)?.partyName || ""
      : "";
    const siteInfo = siteFilterReports !== "all"
      ? siteSummaryData.find(s => s.id === siteFilterReports)?.siteName || ""
      : "";
    
    const totalDispatched = filteredDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
    
    const summaryRows: (string | number)[][] = [];
    summaryRows.push(["Dispatch Report"]);
    summaryRows.push([dateRangeStr]);
    if (partyInfo) summaryRows.push([`Party: ${partyInfo}`]);
    if (siteInfo) summaryRows.push([`Site: ${siteInfo}`]);
    summaryRows.push([]);
    summaryRows.push(["Summary"]);
    
    if (siteFilterReports !== "all") {
      const site = siteSummaryData.find(s => s.id === siteFilterReports);
      summaryRows.push(["Ordered (MT)", site ? site.orderedMT.toFixed(2) : "0.00"]);
      summaryRows.push(["Dispatched (MT)", totalDispatched.toFixed(2)]);
      summaryRows.push(["Pending (MT)", site ? site.balanceMT.toFixed(2) : "0.00"]);
      summaryRows.push(["Dispatch Count", filteredDispatches.length]);
    } else if (partyFilter !== "all") {
      const partySites = siteSummaryData.filter(s => s.partyId === partyFilter);
      const partyOrdered = partySites.reduce((sum, s) => sum + s.orderedMT, 0);
      const partyBalance = partyOrdered - partySites.reduce((sum, s) => sum + s.dispatchedMT, 0);
      summaryRows.push(["Sites", partySites.length]);
      summaryRows.push(["Total Ordered (MT)", partyOrdered.toFixed(2)]);
      summaryRows.push(["Dispatched in Range (MT)", totalDispatched.toFixed(2)]);
      summaryRows.push(["Pending (MT)", partyBalance.toFixed(2)]);
      summaryRows.push(["Dispatch Count", filteredDispatches.length]);
    } else {
      const totalOrdered = siteSummaryData.reduce((sum, s) => sum + s.orderedMT, 0);
      const totalDispatchedAll = siteSummaryData.reduce((sum, s) => sum + s.dispatchedMT, 0);
      summaryRows.push(["Total Parties", parties.length]);
      summaryRows.push(["Active Parties", parties.filter(p => p.status === "ACTIVE").length]);
      summaryRows.push(["Total Ordered (MT)", totalOrdered.toFixed(2)]);
      summaryRows.push(["Total Dispatched (MT)", totalDispatchedAll.toFixed(2)]);
      summaryRows.push(["Pending (MT)", (totalOrdered - totalDispatchedAll).toFixed(2)]);
      summaryRows.push(["Dispatches in Range", filteredDispatches.length]);
    }
    summaryRows.push([]);
    
    const allColumnDefs: { key: ReportColumnKey; header: string; value: (d: Dispatch) => string | number }[] = [
      { key: "challanNo",    header: "Challan No",       value: d => d.challanNo },
      { key: "party",        header: "Party",             value: d => d.partyName },
      { key: "site",         header: "Site",              value: d => d.siteName },
      { key: "mixType",      header: "Mix Type",          value: d => d.mixType || "" },
      { key: "vehicle",      header: "Vehicle",           value: d => d.vehicleNo },
      { key: "driverName",   header: "Driver Name",       value: d => d.driverName || "" },
      { key: "driverMobile", header: "Driver Mobile",     value: d => d.driverMobile || "" },
      { key: "loadMT",       header: "Load (MT)",         value: d => Number(d.loadMT) },
      { key: "dispatchedAt", header: "Dispatched At",     value: d => format(new Date(d.createdAt), "dd/MM/yyyy HH:mm") },
      { key: "status",       header: "Status",            value: d => d.status },
      { key: "arrivedAt",    header: "Arrived At",        value: d => d.arrivedAt ? format(new Date(d.arrivedAt), "dd/MM/yyyy HH:mm") : "" },
      { key: "unloadedAt",   header: "Unloaded At",       value: d => d.leftAt ? format(new Date(d.leftAt), "dd/MM/yyyy HH:mm") : "" },
      { key: "receivedBy",   header: "Received By",       value: d => d.arrivedByName || "" },
      { key: "releasedBy",   header: "Truck Released By", value: d => d.leftByName || "" },
    ];
    const visibleCols = allColumnDefs.filter(c => columnVisibility[c.key]);
    const headers = visibleCols.map(c => c.header);
    const rows = filteredDispatches.map(d => visibleCols.map(c => c.value(d)));

    const worksheet = XLSX.utils.aoa_to_sheet([...summaryRows, headers, ...rows]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dispatches");
    
    const fileName = partyInfo 
      ? `${partyInfo.replace(/\s+/g, "_")}_dispatches_${format(new Date(), "yyyyMMdd")}.xlsx`
      : `dispatches_${format(new Date(), "yyyyMMdd_HHmmss")}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  }

  function handlePrint() {
    const selectedCount = REPORT_COLUMNS.filter(c => columnVisibility[c.key]).length;
    if (selectedCount === 0) {
      toast({ title: "No columns selected", description: "Please select at least one column before printing.", variant: "destructive" });
      setShowColumnChooser(true);
      return;
    }
    const dateRangeStr = dateFrom || dateTo 
      ? `Date: ${dateFrom || "Start"} to ${dateTo || "Today"}`
      : `Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`;
    
    const partyInfo = partyFilter !== "all" 
      ? parties.find(p => p.id === partyFilter)?.partyName || ""
      : "";
    const siteInfo = siteFilterReports !== "all"
      ? siteSummaryData.find(s => s.id === siteFilterReports)?.siteName || ""
      : "";
    
    const printContent = `
      <html>
        <head>
          <title>Dispatch Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { font-size: 18px; margin-bottom: 5px; }
            .date-range { color: #666; font-size: 12px; margin-bottom: 10px; }
            .filter-info { font-size: 12px; margin-bottom: 15px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background: #f5f5f5; font-weight: bold; }
            .summary { margin-bottom: 20px; }
            .summary-item { display: inline-block; margin-right: 30px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Dispatch Report</h1>
          <div class="date-range">${dateRangeStr}</div>
          ${partyInfo ? `<div class="filter-info">Party: ${partyInfo}</div>` : ""}
          ${siteInfo ? `<div class="filter-info">Site: ${siteInfo}</div>` : ""}
          <div class="summary">
            <span class="summary-item"><strong>Dispatches:</strong> ${filteredDispatches.length}</span>
            <span class="summary-item"><strong>Total Qty:</strong> ${filteredDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0).toFixed(2)} MT</span>
          </div>
          <table>
            <thead>
              <tr>
                ${(["challanNo","party","site","mixType","vehicle","driverName","driverMobile","loadMT","dispatchedAt","status","arrivedAt","unloadedAt","receivedBy","releasedBy"] as ReportColumnKey[])
                  .filter(k => columnVisibility[k])
                  .map(k => {
                    const col = REPORT_COLUMNS.find(c => c.key === k)!;
                    return `<th>${col.label}</th>`;
                  }).join("")}
              </tr>
            </thead>
            <tbody>
              ${filteredDispatches.map(d => {
                const cells: string[] = [];
                if (columnVisibility["challanNo"])    cells.push(`<td>${d.challanNo}</td>`);
                if (columnVisibility["party"])        cells.push(`<td>${d.partyName}</td>`);
                if (columnVisibility["site"])         cells.push(`<td>${d.siteName}</td>`);
                if (columnVisibility["mixType"])      cells.push(`<td>${d.mixType || "-"}</td>`);
                if (columnVisibility["vehicle"])      cells.push(`<td>${d.vehicleNo}</td>`);
                if (columnVisibility["driverName"])   cells.push(`<td>${d.driverName || "-"}</td>`);
                if (columnVisibility["driverMobile"]) cells.push(`<td>${d.driverMobile || "-"}</td>`);
                if (columnVisibility["loadMT"])       cells.push(`<td>${Number(d.loadMT).toFixed(2)}</td>`);
                if (columnVisibility["dispatchedAt"]) cells.push(`<td>${format(new Date(d.createdAt), "dd/MM/yyyy HH:mm")}</td>`);
                if (columnVisibility["status"])       cells.push(`<td>${d.status}</td>`);
                if (columnVisibility["arrivedAt"])    cells.push(`<td>${d.arrivedAt ? format(new Date(d.arrivedAt), "dd/MM/yyyy HH:mm") : "-"}</td>`);
                if (columnVisibility["unloadedAt"])   cells.push(`<td>${d.leftAt ? format(new Date(d.leftAt), "dd/MM/yyyy HH:mm") : "-"}</td>`);
                if (columnVisibility["receivedBy"])   cells.push(`<td>${d.arrivedByName || "-"}</td>`);
                if (columnVisibility["releasedBy"])   cells.push(`<td>${d.leftByName || "-"}</td>`);
                return `<tr>${cells.join("")}</tr>`;
              }).join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;
    
    const iframe = document.createElement("iframe");
    iframe.style.position = "absolute";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(printContent);
      iframeDoc.close();
      
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <CompanyHeader size="small" showTagline={false} className="flex-row gap-3" />
            <div className="flex items-center gap-2">
              <NotificationToggle role="ADMIN" />
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
          <div className="text-center mt-1">
            <span className="text-sm font-medium text-gray-600">Command Center</span>
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
            <TabsTrigger value="dispatches" data-testid="tab-dispatches">
              <Truck className="h-4 w-4 mr-2" />
              Dispatches
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
                    <TableHead>Address</TableHead>
                    <TableHead>GST No</TableHead>
                    <TableHead>PAN No</TableHead>
                    <TableHead>Dispatched (MT)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredParties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                        No parties found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredParties.map((party) => {
                      const totals = getPartyTotals(party.id);
                      return (
                        <TableRow key={party.id} data-testid={`row-party-${party.id}`}>
                          <TableCell className="font-medium">{party.partyName}</TableCell>
                          <TableCell>{party.partyCode}</TableCell>
                          <TableCell>{party.address || "-"}</TableCell>
                          <TableCell>{party.gstNo || "-"}</TableCell>
                          <TableCell>{party.panNo || "-"}</TableCell>
                          <TableCell>{totals.dispatched.toFixed(2)}</TableCell>
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
                                onClick={() => setManagingSitesParty(party)}
                                title="Manage Sites"
                                data-testid={`button-manage-sites-${party.id}`}
                              >
                                <MapPin className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copyLink(party.accessId)}
                                title="Copy party link"
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

            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Site Summary
                </CardTitle>
                <CardDescription>Overview of all sites with ordered vs dispatched quantities</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Party Name</TableHead>
                      <TableHead>Site Name</TableHead>
                      <TableHead>Site Code</TableHead>
                      <TableHead>Mix Type</TableHead>
                      <TableHead className="text-right">Ordered MT</TableHead>
                      <TableHead className="text-right">Dispatched MT</TableHead>
                      <TableHead className="text-right">Balance MT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {siteSummaryData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                          No sites found
                        </TableCell>
                      </TableRow>
                    ) : (
                      siteSummaryData.map((site) => (
                        <TableRow key={site.id} data-testid={`row-site-summary-${site.id}`}>
                          <TableCell className="font-medium">{site.partyName}</TableCell>
                          <TableCell>{site.siteName}</TableCell>
                          <TableCell>{site.siteCode}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{site.mixType}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{site.orderedMT.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{site.dispatchedMT.toFixed(2)}</TableCell>
                          <TableCell className={`text-right font-medium ${site.balanceMT < 0 ? 'text-red-600' : site.balanceMT === 0 ? 'text-gray-500' : 'text-green-600'}`}>
                            {site.balanceMT.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dispatches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Dispatches</CardTitle>
                <CardDescription>
                  {dispatches.length} total dispatches — Edit or delete entries with Owner PIN
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Challan No</TableHead>
                        <TableHead>Party</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Vehicle / Driver</TableHead>
                        <TableHead>Load (MT)</TableHead>
                        <TableHead>Dispatched At</TableHead>
                        <TableHead>Arrived At</TableHead>
                        <TableHead>Unloaded At</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dispatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={11} className="text-center text-gray-500 py-8">
                            No dispatches yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        dispatches.map((dispatch) => (
                          <TableRow key={dispatch.id} data-testid={`row-dispatch-main-${dispatch.id}`}>
                            <TableCell className="font-medium">{dispatch.challanNo}</TableCell>
                            <TableCell>{dispatch.partyName}</TableCell>
                            <TableCell>{dispatch.siteName}</TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{dispatch.vehicleNo}</div>
                                {dispatch.driverName && (
                                  <div className="text-xs text-gray-600">{dispatch.driverName}</div>
                                )}
                                {dispatch.driverMobile && (
                                  <div className="text-xs text-blue-600">{dispatch.driverMobile}</div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{Number(dispatch.loadMT).toFixed(2)}</TableCell>
                            <TableCell data-testid={`text-dispatched-at-${dispatch.id}`}>{format(new Date(dispatch.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell data-testid={`text-arrived-at-${dispatch.id}`} className="text-sm text-gray-600">
                              {dispatch.arrivedAt ? format(new Date(dispatch.arrivedAt), "dd/MM/yyyy HH:mm") : <span className="text-gray-300">—</span>}
                            </TableCell>
                            <TableCell data-testid={`text-unloaded-at-${dispatch.id}`} className="text-sm text-gray-600">
                              {dispatch.leftAt ? format(new Date(dispatch.leftAt), "dd/MM/yyyy HH:mm") : <span className="text-gray-300">—</span>}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  dispatch.status === "UNLOADED"
                                    ? "default"
                                    : dispatch.status === "ARRIVED"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {dispatch.status === "UNLOADED" ? "Unloaded" : dispatch.status === "ARRIVED" ? "Arrived" : "Dispatched"}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-[120px] truncate">{dispatch.notes || "-"}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => openEditDispatchDialog(dispatch)}
                                  title="Edit dispatch"
                                  data-testid={`button-edit-dispatch-main-${dispatch.id}`}
                                >
                                  <Edit2 className="h-4 w-4 text-blue-500" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => requestDeleteDispatch(dispatch)}
                                  title="Delete dispatch"
                                  data-testid={`button-delete-dispatch-main-${dispatch.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
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
                        <SelectItem value="UNLOADED">Unloaded</SelectItem>
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
                  <div>
                    <Label className="text-sm font-medium">Site</Label>
                    <Select value={siteFilterReports} onValueChange={setSiteFilterReports}>
                      <SelectTrigger data-testid="select-report-site">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sites</SelectItem>
                        {uniqueSitesForFilter.map((site) => (
                          <SelectItem key={site.id} value={site.id}>{site.siteName} ({site.siteCode})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowColumnChooser(v => !v)}
                      data-testid="button-toggle-columns"
                      className="text-sm text-gray-600 hover:text-gray-900 px-2"
                    >
                      <Columns3 className="h-4 w-4 mr-2" />
                      Choose Columns
                      <span className="ml-2 text-xs text-gray-400">
                        ({REPORT_COLUMNS.filter(c => columnVisibility[c.key]).length}/{REPORT_COLUMNS.length} selected)
                      </span>
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={exportToExcel} data-testid="button-export-excel">
                        <Download className="h-4 w-4 mr-2" />
                        Export Excel
                      </Button>
                      <Button variant="outline" onClick={handlePrint} data-testid="button-print">
                        <Printer className="h-4 w-4 mr-2" />
                        Print
                      </Button>
                    </div>
                  </div>
                  {showColumnChooser && (
                    <div className="border rounded-md p-4 bg-gray-50" data-testid="panel-column-chooser">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">Select columns to include in export / print</span>
                        <div className="flex gap-2">
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => setColumnVisibility(Object.fromEntries(REPORT_COLUMNS.map(c => [c.key, true])) as Record<ReportColumnKey, boolean>)}
                            data-testid="button-select-all-columns"
                          >
                            Select all
                          </button>
                          <span className="text-gray-300">|</span>
                          <button
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => setColumnVisibility(Object.fromEntries(REPORT_COLUMNS.map(c => [c.key, c.defaultEnabled])) as Record<ReportColumnKey, boolean>)}
                            data-testid="button-reset-columns"
                          >
                            Reset defaults
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {REPORT_COLUMNS.map(col => (
                          <label
                            key={col.key}
                            className="flex items-center gap-2 cursor-pointer select-none"
                            data-testid={`label-column-${col.key}`}
                          >
                            <input
                              type="checkbox"
                              checked={columnVisibility[col.key]}
                              onChange={e => setColumnVisibility(prev => ({ ...prev, [col.key]: e.target.checked }))}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 accent-blue-600"
                              data-testid={`checkbox-column-${col.key}`}
                            />
                            <span className="text-sm text-gray-700">{col.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {(() => {
              const filteredDispatchedTotal = filteredDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0);
              const hasDateFilter = dateFrom || dateTo;
              const hasPartyFilter = partyFilter !== "all";
              const hasSiteFilter = siteFilterReports !== "all";

              if (hasSiteFilter) {
                const site = siteSummaryData.find(s => s.id === siteFilterReports);
                const siteDispatchedInRange = filteredDispatchedTotal;
                return (
                  <Card className="bg-gradient-to-r from-blue-50 to-green-50" id="report-summary">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        Site Summary: {site ? `${site.siteName} (${site.siteCode})` : ""}
                        {hasDateFilter && <span className="text-sm font-normal ml-2">({dateFrom || "Start"} to {dateTo || "Today"})</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Ordered</div>
                          <div className="text-xl font-bold text-blue-600" data-testid="report-site-ordered">
                            {site ? site.orderedMT.toFixed(2) : "0.00"} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Dispatched {hasDateFilter ? "(In Range)" : ""}</div>
                          <div className="text-xl font-bold text-green-600" data-testid="report-site-dispatched">
                            {siteDispatchedInRange.toFixed(2)} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Balance</div>
                          <div className="text-xl font-bold" data-testid="report-site-balance">
                            {site ? site.balanceMT.toFixed(2) : "0.00"} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Dispatch Count</div>
                          <div className="text-xl font-bold" data-testid="report-site-count">
                            {filteredDispatches.length}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              if (hasPartyFilter) {
                const partySites = siteSummaryData.filter(s => s.partyId === partyFilter);
                const partyOrdered = partySites.reduce((sum, s) => sum + s.orderedMT, 0);
                const partyDispatched = filteredDispatchedTotal;
                const partyBalance = partyOrdered - partySites.reduce((sum, s) => sum + s.dispatchedMT, 0);
                const partyName = parties.find(p => p.id === partyFilter)?.partyName || "";
                return (
                  <Card className="bg-gradient-to-r from-purple-50 to-blue-50" id="report-summary">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        Party Summary: {partyName}
                        {hasDateFilter && <span className="text-sm font-normal ml-2">({dateFrom || "Start"} to {dateTo || "Today"})</span>}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div>
                          <div className="text-xs text-gray-500">Sites</div>
                          <div className="text-xl font-bold text-blue-600" data-testid="report-party-sites">
                            {partySites.length}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Total Ordered</div>
                          <div className="text-xl font-bold text-purple-600" data-testid="report-party-ordered">
                            {partyOrdered.toFixed(2)} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Dispatched {hasDateFilter ? "(In Range)" : ""}</div>
                          <div className="text-xl font-bold text-green-600" data-testid="report-party-dispatched">
                            {partyDispatched.toFixed(2)} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Pending</div>
                          <div className="text-xl font-bold text-orange-600" data-testid="report-party-balance">
                            {partyBalance.toFixed(2)} MT
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Dispatches</div>
                          <div className="text-xl font-bold" data-testid="report-party-count">
                            {filteredDispatches.length}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              }

              return (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4" id="report-summary">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-blue-600" data-testid="report-total-parties">
                        {parties.length}
                      </div>
                      <p className="text-sm text-gray-500">Total Parties</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-green-600" data-testid="report-active-parties">
                        {parties.filter(p => p.status === "ACTIVE").length}
                      </div>
                      <p className="text-sm text-gray-500">Active Parties</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-purple-600" data-testid="report-total-ordered">
                        {siteSummaryData.reduce((sum, s) => sum + s.orderedMT, 0).toFixed(2)} MT
                      </div>
                      <p className="text-sm text-gray-500">Total Ordered</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-teal-600" data-testid="report-total-dispatched">
                        {hasDateFilter ? filteredDispatchedTotal.toFixed(2) : siteSummaryData.reduce((sum, s) => sum + s.dispatchedMT, 0).toFixed(2)} MT
                      </div>
                      <p className="text-sm text-gray-500">Total Dispatched {hasDateFilter ? "(In Range)" : ""}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold text-orange-600" data-testid="report-balance">
                        {(siteSummaryData.reduce((sum, s) => sum + s.orderedMT, 0) - siteSummaryData.reduce((sum, s) => sum + s.dispatchedMT, 0)).toFixed(2)} MT
                      </div>
                      <p className="text-sm text-gray-500">Pending Quantity</p>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

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
                      <TableHead>Received By</TableHead>
                      <TableHead>Truck Released By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDispatches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-gray-500 py-8">
                          No dispatches found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDispatches.map((dispatch) => {
                        return (
                          <TableRow key={dispatch.id} data-testid={`row-dispatch-${dispatch.id}`}>
                            <TableCell className="font-medium">{dispatch.challanNo}</TableCell>
                            <TableCell>{dispatch.partyName}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{dispatch.mixType || "-"}</Badge>
                            </TableCell>
                            <TableCell>{dispatch.siteName}</TableCell>
                            <TableCell>{dispatch.vehicleNo}</TableCell>
                            <TableCell>{Number(dispatch.loadMT).toFixed(2)}</TableCell>
                            <TableCell>{format(new Date(dispatch.createdAt), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  dispatch.status === "UNLOADED"
                                    ? "default"
                                    : dispatch.status === "ARRIVED"
                                    ? "secondary"
                                    : "outline"
                                }
                              >
                                {dispatch.status === "UNLOADED" ? "Unloaded" : dispatch.status === "ARRIVED" ? "Arrived" : "Dispatched"}
                              </Badge>
                            </TableCell>
                            <TableCell>{dispatch.arrivedByName || "-"}</TableCell>
                            <TableCell>{dispatch.leftByName || "-"}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                  {filteredDispatches.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/50 border-t-2">
                        <td className="p-2 font-bold text-sm" data-testid="text-report-total-label">
                          Total: {filteredDispatches.length} dispatches
                        </td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                        <td className="p-2 font-bold text-sm" data-testid="text-report-total-load">
                          {filteredDispatches.reduce((sum, d) => sum + Number(d.loadMT), 0).toFixed(2)}
                        </td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                        <td className="p-2"></td>
                      </tr>
                    </tfoot>
                  )}
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
            <div className="space-y-2">
              <Label htmlFor="partyName">Party Name *</Label>
              <Input
                id="partyName"
                value={partyForm.partyName}
                onChange={(e) => setPartyForm({ ...partyForm, partyName: e.target.value.toUpperCase() })}
                placeholder="Enter party name"
                data-testid="input-party-name"
                style={{ textTransform: "uppercase" }}
              />
            </div>
            {editingParty && (
              <div className="space-y-2">
                <Label htmlFor="partyCode">Party Code *</Label>
                <Input
                  id="partyCode"
                  value={partyForm.partyCode}
                  onChange={(e) => setPartyForm({ ...partyForm, partyCode: e.target.value.toUpperCase() })}
                  placeholder="Enter party code"
                  data-testid="input-party-code"
                  style={{ textTransform: "uppercase" }}
                />
                <p className="text-xs text-muted-foreground">Short code for this party (e.g., SDT)</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={partyForm.address}
                onChange={(e) => setPartyForm({ ...partyForm, address: e.target.value.toUpperCase() })}
                placeholder="Enter address (optional)"
                data-testid="input-address"
                style={{ textTransform: "uppercase" }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gstNo">GST No</Label>
                <Input
                  id="gstNo"
                  value={partyForm.gstNo}
                  onChange={(e) => setPartyForm({ ...partyForm, gstNo: e.target.value.toUpperCase() })}
                  placeholder="Enter GST number (optional)"
                  data-testid="input-gst-no"
                  style={{ textTransform: "uppercase" }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="panNo">PAN No</Label>
                <Input
                  id="panNo"
                  value={partyForm.panNo}
                  onChange={(e) => setPartyForm({ ...partyForm, panNo: e.target.value.toUpperCase() })}
                  placeholder="Enter PAN number (optional)"
                  data-testid="input-pan-no"
                  style={{ textTransform: "uppercase" }}
                />
              </div>
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
          setSmsAuthToken("");
          setSmsTestNumber("");
          setShowSmsAuthToken(false);
          setSmsConfigDirty(false);
        } else {
          fetchSmsConfig();
        }
        setShowSettingsDialog(open);
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="dialog-settings">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Manage PINs and SMS/WhatsApp alert configuration</DialogDescription>
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
          <Separator />
          <div className="space-y-2">
            <Label className="font-semibold">Push Notifications</Label>
            <p className="text-xs text-muted-foreground">Send a test notification to all subscribed devices</p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  const res = await fetch("/api/push/test", { method: "POST" });
                  const data = await res.json();
                  if (res.ok) {
                    toast({
                      title: "Test sent",
                      description: `Notification sent to ${data.subscriberCount} device(s). Check your notifications.`,
                    });
                  } else {
                    toast({ title: "Error", description: data.error || "Failed to send", variant: "destructive" });
                  }
                } catch {
                  toast({ title: "Error", description: "Failed to send test notification", variant: "destructive" });
                }
              }}
              data-testid="button-test-push"
            >
              <Bell className="h-4 w-4 mr-2" />
              Send Test Notification
            </Button>
          </div>
          <Separator />
          <div className="space-y-3">
            <div>
              <Label className="font-semibold">SMS / WhatsApp Alerts</Label>
              <p className="text-xs text-muted-foreground mt-1">Twilio credentials used for dispatch notifications. DB values override environment variables.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="smsAccountSid">Account SID</Label>
              <Input
                id="smsAccountSid"
                value={smsAccountSid}
                onChange={(e) => { setSmsAccountSid(e.target.value); setSmsConfigDirty(true); }}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                data-testid="input-sms-account-sid"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smsAuthToken">Auth Token</Label>
              <div className="relative">
                <Input
                  id="smsAuthToken"
                  type={showSmsAuthToken ? "text" : "password"}
                  value={smsAuthToken}
                  onChange={(e) => { setSmsAuthToken(e.target.value); setSmsConfigDirty(true); }}
                  placeholder={smsAuthTokenSet ? "••••••••••••••••••••••• (already set)" : "Enter Auth Token"}
                  className="pr-10"
                  data-testid="input-sms-auth-token"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowSmsAuthToken(!showSmsAuthToken)}
                  data-testid="button-toggle-sms-auth-token"
                >
                  {showSmsAuthToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {smsAuthTokenSet && !smsAuthToken && (
                <p className="text-xs text-muted-foreground">Leave blank to keep the existing token.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="smsFromNumber">From Number</Label>
              <Input
                id="smsFromNumber"
                value={smsFromNumber}
                onChange={(e) => { setSmsFromNumber(e.target.value); setSmsConfigDirty(true); }}
                placeholder="+1234567890 or whatsapp:+1234567890"
                data-testid="input-sms-from-number"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSaveSmsConfig}
              disabled={savingSmsConfig}
              data-testid="button-save-sms-config"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {savingSmsConfig ? "Saving..." : "Save SMS Configuration"}
            </Button>
            <Separator className="my-1" />
            <div className="space-y-2">
              <Label htmlFor="smsTestNumber">Send Test Message To</Label>
              {smsConfigDirty && (
                <p className="text-xs text-amber-600">Save your configuration above before sending a test.</p>
              )}
              <div className="flex gap-2">
                <Input
                  id="smsTestNumber"
                  value={smsTestNumber}
                  onChange={(e) => setSmsTestNumber(e.target.value)}
                  placeholder="9876543210 or +91..."
                  className="flex-1"
                  data-testid="input-sms-test-number"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestSms}
                  disabled={sendingTestSms || !smsTestNumber.trim()}
                  data-testid="button-send-test-sms"
                >
                  {sendingTestSms ? "Sending..." : "Send Test"}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings} disabled={savingSettings || !currentOwnerPinForSettings} data-testid="button-save-settings">
              {savingSettings ? "Saving..." : "Save PINs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showOwnerPinDialog} onOpenChange={(open) => { if (!open) { setShowOwnerPinDialog(false); setOwnerPinInput(""); setPendingDeleteAction(null); setPendingStatusAction(null); } }}>
        <DialogContent data-testid="dialog-owner-pin">
          <DialogHeader>
            <DialogTitle>Owner Verification Required</DialogTitle>
            <DialogDescription>
              {pendingDeleteAction?.type === "party" 
                ? `Enter Owner PIN to delete party "${partyToDelete?.partyName}".`
                : pendingDeleteAction?.type === "dispatch"
                ? `Enter Owner PIN to delete dispatch "${dispatchToDelete?.challanNo}".`
                : pendingStatusAction
                ? `Enter Owner PIN to change party status to "${pendingStatusAction.newStatus}".`
                : "Enter Owner PIN to proceed."}
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
            <Button variant="outline" onClick={() => { setShowOwnerPinDialog(false); setOwnerPinInput(""); setPendingDeleteAction(null); setPendingStatusAction(null); }}>
              Cancel
            </Button>
            <Button variant={pendingDeleteAction ? "destructive" : "default"} onClick={verifyOwnerPin} disabled={!ownerPinInput} data-testid="button-verify-owner-pin">
              {pendingDeleteAction ? "Confirm Delete" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!managingSitesParty} onOpenChange={(open) => { if (!open) { setManagingSitesParty(null); setNewSiteName(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Sites - {managingSitesParty?.partyName}</DialogTitle>
            <DialogDescription>
              Add delivery sites for this party. Each site gets a unique shareable link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3 p-3 border rounded-lg bg-gray-50">
              <div className="space-y-2">
                <Label htmlFor="newSiteName">Site Name *</Label>
                <Input
                  id="newSiteName"
                  placeholder="Enter site name"
                  value={newSiteName}
                  onChange={(e) => setNewSiteName(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                  data-testid="input-new-site-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="newSiteMixType">Mix Type *</Label>
                  <Select value={newSiteMixType} onValueChange={setNewSiteMixType}>
                    <SelectTrigger data-testid="select-new-site-mix-type">
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
                  <Label htmlFor="newSiteOrderedMT">Ordered MT</Label>
                  <Input
                    id="newSiteOrderedMT"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newSiteOrderedMT}
                    onChange={(e) => setNewSiteOrderedMT(e.target.value)}
                    data-testid="input-new-site-ordered-mt"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newSiteNotifyMobile">Notify Mobile(s)</Label>
                <Input
                  id="newSiteNotifyMobile"
                  placeholder="e.g., 9876543210, 9123456789"
                  value={newSiteNotifyMobile}
                  onChange={(e) => setNewSiteNotifyMobile(e.target.value)}
                  data-testid="input-new-site-notify-mobile"
                />
                <p className="text-xs text-muted-foreground">Comma-separated (for SMS/WhatsApp alerts)</p>
              </div>
              <Button
                onClick={() => {
                  if (managingSitesParty && newSiteName.trim()) {
                    createSiteMutation.mutate({ 
                      partyId: managingSitesParty.id, 
                      siteName: newSiteName.trim(),
                      mixType: newSiteMixType,
                      orderedMT: newSiteOrderedMT || "0",
                      notifyMobile: newSiteNotifyMobile.trim() || undefined,
                    });
                  }
                }}
                disabled={!newSiteName.trim() || createSiteMutation.isPending}
                className="w-full"
                data-testid="button-add-site"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Site
              </Button>
            </div>

            <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
              {partySites.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No sites added yet. Add your first site above.
                </div>
              ) : (
                partySites.map((site) => (
                  <div key={site.id} className="p-3 flex items-center justify-between" data-testid={`site-row-${site.id}`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        {site.siteName}
                        <Badge variant="outline" className="font-mono text-xs bg-blue-50 text-blue-700 border-blue-200">
                          {site.siteCode}
                        </Badge>
                        <Badge variant={site.status === "ACTIVE" ? "default" : "secondary"}>
                          {site.status || "ACTIVE"}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{site.mixType}</Badge>
                        <span>{Number(site.orderedMT).toFixed(2)} MT</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingSite(site);
                          setEditSiteName(site.siteName);
                          setEditSiteCode(site.siteCode);
                          setEditSiteMixType(site.mixType);
                          setEditSiteOrderedMT(site.orderedMT);
                          setEditSiteNotifyMobile(site.notifyMobile || "");
                          setEditSiteOwnerPin("");
                        }}
                        title="Edit site"
                        data-testid={`button-edit-site-${site.id}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const newStatus = (site.status || "ACTIVE") === "ACTIVE" ? "CLOSED" : "ACTIVE";
                          const pin = prompt(`Enter Owner PIN to ${newStatus === "CLOSED" ? "close" : "reopen"} this site:`);
                          if (pin) {
                            updateSiteMutation.mutate({ id: site.id, ownerPin: pin, status: newStatus });
                          }
                        }}
                        title={site.status === "ACTIVE" ? "Close site" : "Reopen site"}
                        data-testid={`button-toggle-site-${site.id}`}
                      >
                        {(site.status || "ACTIVE") === "ACTIVE" ? <X className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const url = `${window.location.origin}/site/${site.accessId}`;
                          const text = `${site.siteName} — ${url}`;
                          navigator.clipboard.writeText(text).then(() => {
                            toast({ title: "Link copied", description: text });
                          });
                        }}
                        title="Copy site link"
                        data-testid={`button-copy-site-link-${site.id}`}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => {
                          const pin = prompt("Enter Owner PIN to delete this site:");
                          if (pin) {
                            deleteSiteMutation.mutate({ id: site.id, ownerPin: pin });
                          }
                        }}
                        title="Delete site"
                        data-testid={`button-delete-site-${site.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setManagingSitesParty(null); setNewSiteName(""); setNewSiteMixType("DBM"); setNewSiteOrderedMT(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingSite} onOpenChange={(open) => { if (!open) { setEditingSite(null); setEditSiteOwnerPin(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Site</DialogTitle>
            <DialogDescription>
              Update site details. Owner PIN is required to save changes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="editSiteName">Site Name *</Label>
                <Input
                  id="editSiteName"
                  placeholder="Enter site name"
                  value={editSiteName}
                  onChange={(e) => setEditSiteName(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                  data-testid="input-edit-site-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editSiteCode">Site Code *</Label>
                <Input
                  id="editSiteCode"
                  placeholder="Enter site code"
                  value={editSiteCode}
                  onChange={(e) => setEditSiteCode(e.target.value.toUpperCase())}
                  style={{ textTransform: "uppercase" }}
                  data-testid="input-edit-site-code"
                />
                <p className="text-xs text-muted-foreground">e.g., SDT-BASV</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="editSiteMixType">Mix Type *</Label>
                <Select value={editSiteMixType} onValueChange={setEditSiteMixType}>
                  <SelectTrigger data-testid="select-edit-site-mix-type">
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
                <Label htmlFor="editSiteOrderedMT">Ordered MT</Label>
                <Input
                  id="editSiteOrderedMT"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={editSiteOrderedMT}
                  onChange={(e) => setEditSiteOrderedMT(e.target.value)}
                  data-testid="input-edit-site-ordered-mt"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSiteNotifyMobile">Notify Mobile(s)</Label>
              <Input
                id="editSiteNotifyMobile"
                placeholder="e.g., 9876543210, 9123456789"
                value={editSiteNotifyMobile}
                onChange={(e) => setEditSiteNotifyMobile(e.target.value)}
                data-testid="input-edit-site-notify-mobile"
              />
              <p className="text-xs text-muted-foreground">Comma-separated for multiple numbers (for SMS/WhatsApp alerts)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editSiteOwnerPin">Owner PIN *</Label>
              <Input
                id="editSiteOwnerPin"
                type="password"
                placeholder="Enter owner PIN to confirm"
                value={editSiteOwnerPin}
                onChange={(e) => setEditSiteOwnerPin(e.target.value)}
                data-testid="input-edit-site-owner-pin"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingSite(null); setEditSiteOwnerPin(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingSite && editSiteName.trim() && editSiteCode.trim() && editSiteOwnerPin) {
                  updateSiteMutation.mutate({
                    id: editingSite.id,
                    ownerPin: editSiteOwnerPin,
                    siteName: editSiteName.trim(),
                    siteCode: editSiteCode.trim(),
                    mixType: editSiteMixType,
                    orderedMT: editSiteOrderedMT || "0",
                    notifyMobile: editSiteNotifyMobile.trim() || undefined,
                  });
                }
              }}
              disabled={!editSiteName.trim() || !editSiteCode.trim() || !editSiteOwnerPin || updateSiteMutation.isPending}
              data-testid="button-save-site-edit"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingDispatch} onOpenChange={(open) => { if (!open) { setEditingDispatch(null); setEditDispatchOwnerPin(""); } }}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-edit-dispatch">
          <DialogHeader>
            <DialogTitle>Edit Dispatch</DialogTitle>
            <DialogDescription>
              Edit dispatch {editingDispatch?.challanNo}. Owner PIN required to save.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Challan No</Label>
              <Input value={editingDispatch?.challanNo || ""} disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label>Party / Site</Label>
              <Input value={`${editingDispatch?.partyName || ""} — ${editingDispatch?.siteName || ""}`} disabled className="bg-gray-50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editVehicleNo">Vehicle No *</Label>
              <Input
                id="editVehicleNo"
                value={editDispatchForm.vehicleNo}
                onChange={(e) => setEditDispatchForm({ ...editDispatchForm, vehicleNo: e.target.value.toUpperCase() })}
                placeholder="Enter vehicle number"
                style={{ textTransform: "uppercase" }}
                data-testid="input-edit-dispatch-vehicle"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="editDriverName">Driver Name</Label>
                <Input
                  id="editDriverName"
                  value={editDispatchForm.driverName}
                  onChange={(e) => setEditDispatchForm({ ...editDispatchForm, driverName: e.target.value })}
                  placeholder="Driver name (optional)"
                  data-testid="input-edit-dispatch-driver-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editDriverMobile">Driver Mobile</Label>
                <Input
                  id="editDriverMobile"
                  value={editDispatchForm.driverMobile}
                  onChange={(e) => setEditDispatchForm({ ...editDispatchForm, driverMobile: e.target.value })}
                  placeholder="Mobile number"
                  maxLength={15}
                  data-testid="input-edit-dispatch-driver-mobile"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLoadMT">Load (MT) *</Label>
              <Input
                id="editLoadMT"
                type="number"
                step="0.01"
                value={editDispatchForm.loadMT}
                onChange={(e) => setEditDispatchForm({ ...editDispatchForm, loadMT: e.target.value })}
                placeholder="Enter load in MT"
                data-testid="input-edit-dispatch-load"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editNotes">Notes</Label>
              <Input
                id="editNotes"
                value={editDispatchForm.notes}
                onChange={(e) => setEditDispatchForm({ ...editDispatchForm, notes: e.target.value.toUpperCase() })}
                placeholder="Optional notes"
                style={{ textTransform: "uppercase" }}
                data-testid="input-edit-dispatch-notes"
              />
            </div>
            {editingDispatch && (
              <div className="bg-gray-50 rounded-md p-3 space-y-1 text-xs">
                <p className="font-semibold text-gray-700 mb-1">Timestamps</p>
                <div className="flex justify-between">
                  <span className="text-gray-500">Dispatched:</span>
                  <span>{format(new Date(editingDispatch.createdAt), "dd MMM yyyy HH:mm")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Arrived:</span>
                  <span>{editingDispatch.arrivedAt ? format(new Date(editingDispatch.arrivedAt), "dd MMM yyyy HH:mm") : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Unloaded:</span>
                  <span>{editingDispatch.leftAt ? format(new Date(editingDispatch.leftAt), "dd MMM yyyy HH:mm") : "—"}</span>
                </div>
              </div>
            )}
            <Separator />
            <div className="space-y-2">
              <Label htmlFor="editDispatchOwnerPin">Owner PIN *</Label>
              <Input
                id="editDispatchOwnerPin"
                type="password"
                value={editDispatchOwnerPin}
                onChange={(e) => setEditDispatchOwnerPin(e.target.value)}
                placeholder="Enter Owner PIN to confirm"
                onKeyDown={(e) => e.key === "Enter" && handleEditDispatchSubmit()}
                data-testid="input-edit-dispatch-owner-pin"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingDispatch(null); setEditDispatchOwnerPin(""); }}>
              Cancel
            </Button>
            <Button
              onClick={handleEditDispatchSubmit}
              disabled={!editDispatchForm.vehicleNo.trim() || !editDispatchForm.loadMT || !editDispatchOwnerPin || editDispatchMutation.isPending}
              data-testid="button-save-dispatch-edit"
            >
              {editDispatchMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
