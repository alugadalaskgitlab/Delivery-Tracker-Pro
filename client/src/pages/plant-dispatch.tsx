import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
import { Loader2 } from "lucide-react";

type Party = {
  id: string;
  partyName: string;
  partyCode: string;
  orderRefNo?: string | null;
  totalRequiredMT: number;
  status: "ACTIVE" | "INACTIVE" | "CLOSED";
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
  loadMT: number;
  createdAt: string;
  status: "DISPATCHED" | "ARRIVED" | "LEFT";
  arrivedAt?: string | null;
  leftAt?: string | null;
  arrivedByName?: string | null;
  leftByName?: string | null;
  notes?: string | null;
};

export default function PlantDispatch() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [partyId, setPartyId] = useState("");
  const [siteName, setSiteName] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [loadMT, setLoadMT] = useState("");
  const [notes, setNotes] = useState("");

  const { data: parties = [] } = useQuery<Party[]>({
    queryKey: ["/api/parties"],
    queryFn: async () => {
      const res = await fetch("/api/parties");
      if (!res.ok) throw new Error("Failed to fetch parties");
      return res.json();
    },
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
      setSiteName("");
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
    
    if (!partyId || !siteName || !vehicleNo || !loadMT) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
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

    createMutation.mutate({
      partyId,
      siteName: siteName.trim().toUpperCase(),
      vehicleNo: vehicleNo.trim().toUpperCase(),
      loadMT: loadNum,
      notes: notes.trim() || undefined,
    });
  };

  const selectedParty = parties.find((p) => p.id === partyId);
  const balanceMT = useMemo(() => {
    if (!selectedParty) return 0;
    const dispatched = dispatches
      .filter((d) => d.partyId === selectedParty.id)
      .reduce((sum, d) => sum + d.loadMT, 0);
    return selectedParty.totalRequiredMT - dispatched;
  }, [selectedParty, dispatches]);

  const activeParties = parties.filter((p) => p.status === "ACTIVE");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">Plant Dispatch</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.displayName}</span>
            <Button variant="outline" onClick={logout} data-testid="button-logout">
              Logout
            </Button>
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
                  <Select value={partyId} onValueChange={setPartyId}>
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

                {selectedParty && (
                  <div className="space-y-2">
                    <Label>Balance Quantity</Label>
                    <div className="h-10 px-3 py-2 border rounded-md bg-gray-50">
                      <span className={`font-semibold ${balanceMT < 0 ? "text-red-600" : "text-green-600"}`}>
                        {balanceMT.toFixed(2)} MT
                      </span>
                      <span className="text-sm text-gray-500 ml-2">
                        (Total: {selectedParty.totalRequiredMT} MT)
                      </span>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="siteName">Site Name *</Label>
                  <Input
                    id="siteName"
                    data-testid="input-site-name"
                    value={siteName}
                    onChange={(e) => setSiteName(e.target.value)}
                    placeholder="Enter site name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="vehicleNo">Vehicle Number *</Label>
                  <Input
                    id="vehicleNo"
                    data-testid="input-vehicle-no"
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value)}
                    placeholder="e.g., MH12AB1234"
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
                    onChange={(e) => setNotes(e.target.value)}
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
                      <TableCell>{dispatch.loadMT.toFixed(2)}</TableCell>
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
