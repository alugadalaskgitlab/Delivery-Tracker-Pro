import { Route, Switch, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import NotFound from "@/pages/not-found";
import Login from "./pages/login";
import AdminDashboard from "./pages/admin-dashboard";
import PlantDispatch from "./pages/plant-dispatch";
import SiteDispatch from "./pages/site-dispatch";

function ProtectedRoute({ 
  component: Component, 
  allowedRoles 
}: { 
  component: React.ComponentType;
  allowedRoles: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (!allowedRoles.includes(user.role)) {
    return <Redirect to={user.role === "ADMIN" ? "/admin" : user.role === "PLANT" ? "/plant" : "/site"} />;
  }

  return <Component />;
}

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route path="/:rest*">
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/login">
        <Redirect to={user.role === "ADMIN" ? "/admin" : user.role === "PLANT" ? "/plant" : "/site"} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={AdminDashboard} allowedRoles={["ADMIN"]} />
      </Route>
      <Route path="/plant">
        <ProtectedRoute component={PlantDispatch} allowedRoles={["PLANT"]} />
      </Route>
      <Route path="/site">
        <ProtectedRoute component={SiteDispatch} allowedRoles={["SITE"]} />
      </Route>
      <Route path="/">
        <Redirect to={user.role === "ADMIN" ? "/admin" : user.role === "PLANT" ? "/plant" : "/site"} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
