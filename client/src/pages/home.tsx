import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Shield, Factory, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type RoleType = "admin" | "plant" | "site" | null;

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<RoleType>(null);
  const [pin, setPin] = useState("");
  const [siteToken, setSiteToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function handlePinSubmit() {
    if (!pin || !selectedRole) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/pin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole.toUpperCase(), pin }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Invalid PIN");
      }

      setLocation(`/${selectedRole}`);
    } catch (error) {
      toast({
        title: "Access Denied",
        description: error instanceof Error ? error.message : "Invalid PIN",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setPin("");
    }
  }

  async function handleSiteSubmit() {
    if (!siteToken) return;

    setLoading(true);
    try {
      const res = await fetch("/api/auth/site-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: siteToken }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Invalid token");
      }

      setLocation("/site");
    } catch (error) {
      toast({
        title: "Access Denied",
        description: error instanceof Error ? error.message : "Invalid or inactive token",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      setSiteToken("");
    }
  }

  function closeDialog() {
    setSelectedRole(null);
    setPin("");
    setSiteToken("");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">DispatchFlow</h1>
          <p className="text-lg text-gray-600">Material Dispatch Management System</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-blue-400"
            onClick={() => setSelectedRole("admin")}
            data-testid="card-admin"
          >
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <CardTitle>Admin</CardTitle>
              <CardDescription>Full access to all features</CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-gray-500">
              Manage parties, view all dispatches, export data, reconcile orders
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-green-400"
            onClick={() => setSelectedRole("plant")}
            data-testid="card-plant"
          >
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Factory className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle>Plant</CardTitle>
              <CardDescription>Dispatch entry access</CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-gray-500">
              Create dispatches, view own dispatch summary, track acknowledgements
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:shadow-lg transition-shadow border-2 hover:border-orange-400"
            onClick={() => setSelectedRole("site")}
            data-testid="card-site"
          >
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-orange-600" />
              </div>
              <CardTitle>Site</CardTitle>
              <CardDescription>Delivery acknowledgement</CardDescription>
            </CardHeader>
            <CardContent className="text-center text-sm text-gray-500">
              View trips, mark arrivals and departures with receiver name
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={selectedRole === "admin" || selectedRole === "plant"} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-pin">
          <DialogHeader>
            <DialogTitle>
              {selectedRole === "admin" ? "Admin Access" : "Plant Access"}
            </DialogTitle>
            <DialogDescription>
              Enter your PIN to continue
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="pin">PIN</Label>
              <Input
                id="pin"
                type="password"
                data-testid="input-pin"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter PIN"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel">
              Cancel
            </Button>
            <Button onClick={handlePinSubmit} disabled={loading || !pin} data-testid="button-submit-pin">
              {loading ? "Verifying..." : "Enter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={selectedRole === "site"} onOpenChange={() => closeDialog()}>
        <DialogContent data-testid="dialog-token">
          <DialogHeader>
            <DialogTitle>Site Access</DialogTitle>
            <DialogDescription>
              Enter your site access token to view deliveries
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteToken">Access Token</Label>
              <Input
                id="siteToken"
                type="text"
                data-testid="input-site-token"
                value={siteToken}
                onChange={(e) => setSiteToken(e.target.value)}
                placeholder="Enter access token"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSiteSubmit()}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-site">
              Cancel
            </Button>
            <Button onClick={handleSiteSubmit} disabled={loading || !siteToken} data-testid="button-submit-token">
              {loading ? "Verifying..." : "Enter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
