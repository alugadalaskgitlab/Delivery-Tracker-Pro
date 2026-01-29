import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Loader2, PackageCheck, Truck } from "lucide-react";
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

export default function SiteDispatch() {
  const { user, logout, partyId } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDispatch, setSelectedDispatch] = useState<Dispatch | null>(null);
  const [action, setAction] = useState<"arrived" | "left" | null>(null);
  const [receiverName, setReceiverName] = useState("");

  const { data: dispatches = [], isLoading } = useQuery<Dispatch[]>({
    queryKey: ["/api/dispatches"],
    queryFn: async () => {
      const res = await fetch("/api/dispatches");
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: async ({ id, action, name }: { id: string; action: "arrived" | "left"; name: string }) => {
      const endpoint = action === "arrived" ? `/api/dispatches/${id}/arrived` : `/api/dispatches/${id}/left`;
      const body = action === "arrived" ? { arrivedByName: name } : { leftByName: name };

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Acknowledgement failed");
      }

      return res.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dispatches"] });
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

  const dispatchedCount = dispatches.filter((d) => d.status === "DISPATCHED").length;
  const arrivedCount = dispatches.filter((d) => d.status === "ARRIVED").length;
  const leftCount = dispatches.filter((d) => d.status === "LEFT").length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Site Dispatch Tracking</h1>
            <p className="text-sm text-gray-600">{user?.displayName}</p>
          </div>
          <Button variant="outline" onClick={logout} data-testid="button-logout">
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">In Transit</p>
                  <p className="text-3xl font-bold">{dispatchedCount}</p>
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
                  <p className="text-3xl font-bold">{arrivedCount}</p>
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
                  <p className="text-3xl font-bold">{leftCount}</p>
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
            {isLoading ? (
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
                        <TableCell>{dispatch.loadMT.toFixed(2)}</TableCell>
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
                              Received by: {dispatch.arrivedByName}
                            </div>
                          )}
                          {dispatch.leftByName && dispatch.status === "LEFT" && (
                            <div className="text-xs text-gray-500 mt-1">
                              Left with: {dispatch.leftByName}
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
                  <span className="font-medium">{selectedDispatch.loadMT.toFixed(2)} MT</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="receiverName">Receiver Name *</Label>
                <Input
                  id="receiverName"
                  data-testid="input-receiver-name"
                  value={receiverName}
                  onChange={(e) => setReceiverName(e.target.value)}
                  placeholder="Enter receiver name"
                  autoFocus
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
