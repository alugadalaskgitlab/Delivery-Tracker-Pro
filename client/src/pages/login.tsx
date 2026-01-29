import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [siteToken, setSiteToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUserLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;

    setLoading(true);
    try {
      const user = await login({ username, password });
      if (user.role === "ADMIN") {
        setLocation("/admin");
      } else if (user.role === "PLANT") {
        setLocation("/plant");
      } else if (user.role === "SITE") {
        setLocation("/site");
      }
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleSiteLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!siteToken) return;

    setLoading(true);
    try {
      const user = await login({ siteToken });
      setLocation("/site");
    } catch (error) {
      toast({
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Invalid site token",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dispatch Management</CardTitle>
          <CardDescription>Login to access the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="user">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="user" data-testid="tab-user-login">User Login</TabsTrigger>
              <TabsTrigger value="site" data-testid="tab-site-login">Site Access</TabsTrigger>
            </TabsList>

            <TabsContent value="user">
              <form onSubmit={handleUserLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    type="text"
                    data-testid="input-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    autoComplete="username"
                    disabled={loading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    data-testid="input-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-login" disabled={loading}>
                  {loading ? "Logging in..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="site">
              <form onSubmit={handleSiteLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="siteToken">Site Access Token</Label>
                  <Input
                    id="siteToken"
                    type="text"
                    data-testid="input-site-token"
                    value={siteToken}
                    onChange={(e) => setSiteToken(e.target.value)}
                    placeholder="Enter site token"
                    disabled={loading}
                  />
                </div>
                <Button type="submit" className="w-full" data-testid="button-site-login" disabled={loading}>
                  {loading ? "Verifying..." : "Access Site"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
