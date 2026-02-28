import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, Home } from "lucide-react";
import CompanyHeader from "@/components/CompanyHeader";
import { NotificationToggle } from "@/components/NotificationToggle";
import { playStatusUpdateSound, playNewDispatchSound, initializeAudioContext } from "@/lib/sounds";

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string | null;
  mixType?: string;
  totalRequiredMT: string;
  siteName?: string | null;
  status: "ACTIVE" | "INACTIVE" | "CLOSED";
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
};

type Dispatch = {
  id: string;
  challanNo: string;
  partyId: string;
  partyName: string;
  partyCode: string;
  siteId?: string | null;
  siteCode?: string | null;
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

export default function PlantDispatch() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [partyId, setPartyId] = useState("");
  const [siteId, setSiteId] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [loadMT, setLoadMT] = useState("");
  const [notes, setNotes] = useState("");
  const [nextChallan, setNextChallan] = useState<string | null>(null);

  useEffect(() => {
    initializeAudioContext();
    const socket = io();
    
    socket.on("dispatch-status-updated", (data: {
      dispatch: Dispatch;
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

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setLocation("/");
  }

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
    queryFn: async () => {
      const res = await fetch("/api/parties");
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
  });

  const { data: sites = [] } = useQuery<Site[]>({
    queryKey: ["/api/parties", partyId, "sites"],
    queryFn: async () => {
      if (!partyId) return [];
      const res = await fetch(`/api/parties/${partyId}/sites`);
      if (!res.ok) throw new Error("Failed to fetch sites");
      return res.json();
    },
    enabled: !!partyId,
  });

  const { data: dispatches = [], refetch } = useQuery<Dispatch[]>({
    queryKey: ["/api/dispatches"],
    queryFn: async () => {
      const res = await fetch("/api/dispatches");
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/dispatches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create dispatch");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
      setPartyId("");
      setSiteId("");
      setVehicleNo("");
      setLoadMT("");
      setNotes("");
      toast({
        title: "Dispatch Created",
        description: "New dispatch has been successfully created",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!partyId || !siteId || !vehicleNo || !loadMT) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const selectedSite = sites.find((s) => s.id === siteId);
    if (!selectedSite) {
      toast({
        title: "Validation Error",
        description: "Please select a valid site",
        variant: "destructive",
      });
      return;
    }

    const loadNum = parseFloat(loadMT);
    if (isNaN(loadNum) || loadNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Load MT must be a positive number",
        variant: "destructive",
      });
      return;
    }

    const party = parties.find((p) => p.id === partyId);
    if (!party) {
      toast({
        title: "Error",
        description: "Selected party not found",
        variant: "destructive",
      });
      return;
    }

    createMutation.mutate({
      partyId,
      partyName: party.partyName,
      partyCode: party.partyCode,
      orderRefNo: party.orderRefNo || undefined,
      siteId: selectedSite.id,
      siteName: selectedSite.siteName,
      vehicleNo: vehicleNo.trim().toUpperCase(),
      loadMT: String(loadNum),
      status: "DISPATCHED",
      notes: notes.trim() || undefined,
    });
  };

  const selectedParty = parties.find((p) => p.id === partyId);
  const selectedSite = sites.find((s) => s.id === siteId);

  useEffect(() => {
    if (siteId) {
      fetch(`/api/sites/${siteId}/next-challan`, { credentials: "include" })
        .then(res => res.json())
        .then(data => setNextChallan(data.challanNo))
        .catch(() => setNextChallan(null));
    } else {
      setNextChallan(null);
    }
  }, [siteId, dispatches]);
  
  const siteStats = useMemo(() => {
    if (!selectedSite) return { ordered: 0, dispatched: 0, balance: 0, mixType: "DBM" };
    const dispatched = dispatches
      .filter((d) => d.siteId === selectedSite.id)
      .reduce((sum, d) => sum + Number(d.loadMT), 0);
    const ordered = Number(selectedSite.orderedMT);
    const balance = ordered - dispatched;
    return { ordered, dispatched, balance, mixType: selectedSite.mixType || "DBM" };
  }, [selectedSite, dispatches]);

  const activeParties = parties.filter((p) => p.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <CompanyHeader size="small" showTagline={false} className="flex-row gap-3" />
            <div className="flex items-center gap-4">
              <NotificationToggle role="PLANT" />
              <Button variant="outline" onClick={handleLogout} data-testid="button-home" className="gap-2">
                <Home className="h-4 w-4" />
                Home
              </Button>
            </div>
          </div>
          <div className="text-center mt-1">
            <span className="text-sm font-medium text-gray-600">Dispatch Desk</span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Create New Dispatch</CardTitle>
            <CardDescription>Enter dispatch details to create a new challan</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="party">Party/Order *</Label>
                  <Select value={partyId} onValueChange={(value) => {
                  setPartyId(value);
                  setSiteId("");
                }}>
                    <SelectTrigger data-testid="select-party">
                      <SelectValue placeholder="Select party/order" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeParties.map((party) => (
                        <SelectItem key={party.id} value={party.id} data-testid={`option-party-${party.id}`}>
                          {party.partyName} ({party.partyCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="site">Site *</Label>
                  <Select value={siteId} onValueChange={setSiteId} disabled={!partyId}>
                    <SelectTrigger data-testid="select-site">
                      <SelectValue placeholder={partyId ? "Select site" : "Select party first"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((site) => (
                        <SelectItem key={site.id} value={site.id} data-testid={`option-site-${site.id}`}>
                          {site.siteName} ({site.siteCode})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {partyId && sites.length === 0 && (
                    <p className="text-xs text-orange-600">No sites added for this party. Admin must add sites first.</p>
                  )}
                </div>

                {selectedSite && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Site Details</Label>
                    <div className="p-4 border rounded-md bg-blue-50 grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div>
                        <div className="text-xs text-gray-500">Next Challan</div>
                        <div className="font-semibold text-purple-600" data-testid="text-next-challan">
                          {nextChallan || "..."}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Mix Type</div>
                        <div className="font-semibold">{siteStats.mixType}</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Ordered Qty</div>
                        <div className="font-semibold">{siteStats.ordered.toFixed(2)} MT</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Dispatched</div>
                        <div className="font-semibold">{siteStats.dispatched.toFixed(2)} MT</div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500">Balance</div>
                        <div className={`font-semibold ${siteStats.balance < 0 ? "text-red-600" : "text-green-600"}`}>
                          {siteStats.balance.toFixed(2)} MT
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="vehicleNo">Vehicle Number *</Label>
                  <Input
                    id="vehicleNo"
                    data-testid="input-vehicle-no"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                    placeholder="e.g., MH12AB1234"
                    style={{ textTransform: "uppercase" }}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="loadMT">Load (MT) *</Label>
                  <Input
                    id="loadMT"
                    type="number"
                    step="0.01"
                    data-testid="input-load-mt"
                    value={loadMT}
                    onChange={(e) => setLoadMT(e.target.value)}
                    placeholder="Enter load in MT"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="notes">Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    data-testid="textarea-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.toUpperCase())}
                    placeholder="Add any additional notes"
                    rows={2}
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                data-testid="button-create-dispatch" 
                disabled={createMutation.isPending}
              >
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Dispatch
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My Dispatches</CardTitle>
            <CardDescription>View all dispatches created by you</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challan No</TableHead>
                  <TableHead>Party</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead>Load (MT)</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Receiver</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dispatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                      No dispatches created yet
                    </TableCell>
                  </TableRow>
                ) : (
                  dispatches.map((dispatch) => (
                    <TableRow key={dispatch.id} data-testid={`row-dispatch-${dispatch.id}`}>
                      <TableCell className="font-medium">{dispatch.challanNo}</TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{dispatch.partyName}</div>
                          <div className="text-sm text-gray-500">{dispatch.partyCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>{dispatch.siteName}</TableCell>
                      <TableCell>{dispatch.vehicleNo}</TableCell>
                      <TableCell>{Number(dispatch.loadMT).toFixed(2)}</TableCell>
                      <TableCell>{format(new Date(dispatch.createdAt), "dd MMM yyyy HH:mm")}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            dispatch.status === "LEFT"
                              ? "default"
                              : dispatch.status === "ARRIVED"
                              ? "secondary"
                              : "outline"
                          }
                          data-testid={`badge-status-${dispatch.id}`}
                        >
                          {dispatch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {dispatch.status === "ARRIVED" && dispatch.arrivedByName && (
                          <div className="text-sm">
                            <div className="font-medium">{dispatch.arrivedByName}</div>
                            <div className="text-gray-500">
                              {dispatch.arrivedAt && format(new Date(dispatch.arrivedAt), "dd MMM HH:mm")}
                            </div>
                          </div>
                        )}
                        {dispatch.status === "LEFT" && dispatch.leftByName && (
                          <div className="text-sm">
                            <div className="font-medium">{dispatch.leftByName}</div>
                            <div className="text-gray-500">
                              {dispatch.leftAt && format(new Date(dispatch.leftAt), "dd MMM HH:mm")}
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
