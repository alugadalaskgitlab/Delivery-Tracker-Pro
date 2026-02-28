import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, PackageCheck, Truck, XCircle } from "lucide-react";
import CompanyHeader from "@/components/CompanyHeader";
import { NotificationToggle } from "@/components/NotificationToggle";
import { io } from "socket.io-client";
import { playNewDispatchSound, initializeAudioContext } from "@/lib/sounds";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

type TokenValidation = {
  valid: boolean;
  partyName?: string;
  partyCode?: string;
  siteId?: string;
  siteName?: string;
  totalRequiredMT?: string;
  receivedMT?: string;
  balanceMT?: string;
  error?: string;
};

export default function SiteAccess() {
  const { token } = useParams<{ token: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [action, setAction] = useState<"arrived" | "left" | null>(null);
  const [receiverName, setReceiverName] = useState("");

  useEffect(() => {
    initializeAudioContext();
    const socket = io();
    
    socket.on("new-dispatch", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/site/dispatches", token] });
      queryClient.invalidateQueries({ queryKey: ["/api/site/validate", token] });
      playNewDispatchSound();
      
      toast({
        title: "New Dispatch",
        description: "A new dispatch has been created for your site",
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [queryClient, toast, token]);

  const { data: validation, isLoading: validating, error: validationError } = useQuery<TokenValidation>({
    queryKey: ["/api/site/validate", token],
    queryFn: async () => {
      const res = await fetch(`/api/site/validate/${token}`);
      if (!res.ok) {
        const error = await res.json();
        return { valid: false, error: error.error || "Invalid token" };
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const { data: dispatches = [], isLoading: loadingDispatches } = useQuery<Dispatch[]>({
    queryKey: ["/api/site/dispatches", token],
    queryFn: async () => {
      const res = await fetch(`/api/site/dispatches/${token}`);
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
    enabled: validation?.valid === true,
    refetchInterval: 5000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, action, name }: { id: string; action: "arrived" | "left"; name: string }) => {
      const endpoint = action === "arrived" 
        ? `/api/site/dispatches/${id}/arrived` 
        : `/api/site/dispatches/${id}/left`;
      const body = action === "arrived" ? { arrivedByName: name } : { leftByName: name };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, token }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Acknowledgement failed");
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/site/dispatches", token] });
      setSelectedDispatch(null);
      setAction(null);
      setReceiverName("");
      
      toast({
        title: "Success",
        description: `Marked as ${variables.action === "arrived" ? "ARRIVED" : "LEFT"}`,
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

  function handleAcknowledge(dispatch: Dispatch, type: "arrived" | "left") {
    setSelectedDispatch(dispatch);
    setAction(type);
    setReceiverName("");
  }

  function handleSubmit() {
    if (!selectedDispatch || !action || !receiverName.trim()) {
      toast({
        title: "Validation Error",
        description: "Receiver name is required",
        variant: "destructive",
      });
      return;
    }

    acknowledgeMutation.mutate({
      id: selectedDispatch.id,
      action,
      name: receiverName.trim(),
    });
  }

  if (validating) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600">Validating access...</p>
        </div>
      </div>
    );
  }

  if (!validation?.valid) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <CardTitle className="text-red-600">Access Closed</CardTitle>
            <CardDescription>
              {validation?.error || "This access link is no longer valid or the party/order has been closed."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-gray-500">
              Please contact your administrator for a new access link if needed.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const dispatchedCount = dispatches.filter((d) => d.status === "DISPATCHED").length;
  const arrivedCount = dispatches.filter((d) => d.status === "ARRIVED").length;
  const leftCount = dispatches.filter((d) => d.status === "LEFT").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center mb-2">
            <CompanyHeader size="small" showTagline={false} />
            <NotificationToggle role="SITE" siteId={validation.siteId} />
          </div>
          <div className="text-center">
            <span className="text-sm font-medium text-gray-600">Site Dispatch Tracking</span>
            <p className="text-sm text-gray-500">
              {validation.partyName} ({validation.partyCode})
              {validation.siteName && <span className="ml-1 font-medium">- {validation.siteName}</span>}
            </p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-gray-600 font-medium">Total Ordered</p>
                <p className="text-2xl font-bold text-blue-700" data-testid="qty-ordered">
                  {Number(validation.orderedMT || validation.totalRequiredMT || 0).toFixed(2)} MT
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Dispatched</p>
                <p className="text-2xl font-bold text-green-700" data-testid="qty-dispatched">
                  {Number(validation.totalRequiredMT || 0).toFixed(2)} MT
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Balance</p>
                <p className="text-2xl font-bold text-orange-700" data-testid="qty-balance">
                  {Number(validation.balanceMT || 0).toFixed(2)} MT
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">In Transit</p>
                  <p className="text-3xl font-bold" data-testid="count-dispatched">{dispatchedCount}</p>
                </div>
                <Truck className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Arrived</p>
                  <p className="text-3xl font-bold" data-testid="count-arrived">{arrivedCount}</p>
                </div>
                <PackageCheck className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Completed</p>
                  <p className="text-3xl font-bold" data-testid="count-left">{leftCount}</p>
                </div>
                <PackageCheck className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dispatches</CardTitle>
            <CardDescription>Track and acknowledge incoming deliveries</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingDispatches ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan No</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Vehicle</TableHead>
                    <TableHead>Load (MT)</TableHead>
                    <TableHead>Dispatched</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatches.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                        No dispatches found
                      </TableCell>
                    </TableRow>
                  ) : (
                    dispatches.map((dispatch) => (
                      <TableRow key={dispatch.id} data-testid={`row-dispatch-${dispatch.id}`}>
                        <TableCell className="font-medium">{dispatch.challanNo}</TableCell>
                        <TableCell>{dispatch.siteName}</TableCell>
                        <TableCell>{dispatch.vehicleNo}</TableCell>
                        <TableCell>{Number(dispatch.loadMT).toFixed(2)}</TableCell>
                        <TableCell>{format(new Date(dispatch.createdAt), "dd MMM HH:mm")}</TableCell>
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
                          <div className="flex gap-2">
                            {dispatch.status === "DISPATCHED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-arrived-${dispatch.id}`}
                                onClick={() => handleAcknowledge(dispatch, "arrived")}
                              >
                                Mark Arrived
                              </Button>
                            )}
                            {dispatch.status === "ARRIVED" && (
                              <Button
                                size="sm"
                                variant="outline"
                                data-testid={`button-left-${dispatch.id}`}
                                onClick={() => handleAcknowledge(dispatch, "left")}
                              >
                                Mark Left
                              </Button>
                            )}
                            {dispatch.status === "LEFT" && (
                              <span className="text-sm text-gray-500">Completed</span>
                            )}
                          </div>
                          {dispatch.arrivedByName && (
                            <div className="text-xs text-gray-500 mt-1">
                              Received By: {dispatch.arrivedByName}
                            </div>
                          )}
                          {dispatch.leftByName && dispatch.status === "LEFT" && (
                            <div className="text-xs text-gray-500 mt-1">
                              Truck Released By: {dispatch.leftByName}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={!!action} onOpenChange={() => { setAction(null); setSelectedDispatch(null); setReceiverName(""); }}>
        <DialogContent data-testid="dialog-acknowledge">
          <DialogHeader>
            <DialogTitle>
              {action === "arrived" ? "Mark as Arrived" : "Mark as Left"}
            </DialogTitle>
            <DialogDescription>
              {action === "arrived"
                ? "Acknowledge that this delivery has arrived at your site"
                : "Acknowledge that the vehicle has left your site"}
            </DialogDescription>
          </DialogHeader>

          {selectedDispatch && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-md space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Challan No:</span>
                  <span className="font-medium">{selectedDispatch.challanNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Vehicle:</span>
                  <span className="font-medium">{selectedDispatch.vehicleNo}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Load:</span>
                  <span className="font-medium">{Number(selectedDispatch.loadMT).toFixed(2)} MT</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receiverName">Receiver Name *</Label>
                <Input
                  id="receiverName"
                  data-testid="input-receiver-name"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value.toUpperCase())}
                  placeholder="Enter receiver name"
                  autoFocus
                  style={{ textTransform: "uppercase" }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setAction(null); setSelectedDispatch(null); setReceiverName(""); }}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={acknowledgeMutation.isPending || !receiverName.trim()}
              data-testid="button-confirm"
            >
              {acknowledgeMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
