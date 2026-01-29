import { Route, Switch, Redirect, Router } from "wouter";
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

function AuthenticatedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-lg text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/login" component={Login} />
        <Route>
          <Redirect to="/login" />
        </Route>
      </Switch>
    );
  }

  const homeRoute = user.role === "ADMIN" ? "/admin" : user.role === "PLANT" ? "/plant" : "/site";

  return (
    <Switch>
      <Route path="/login">
        <Redirect to={homeRoute} />
      </Route>
      <Route path="/admin">
        {user.role === "ADMIN" ? <AdminDashboard /> : <Redirect to={homeRoute} />}
      </Route>
      <Route path="/plant">
        {user.role === "PLANT" ? <PlantDispatch /> : <Redirect to={homeRoute} />}
      </Route>
      <Route path="/site">
        {user.role === "SITE" ? <SiteDispatch /> : <Redirect to={homeRoute} />}
      </Route>
      <Route path="/">
        <Redirect to={homeRoute} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <AuthenticatedRoutes />
          </TooltipProvider>
        </AuthProvider>
      </Router>
    </QueryClientProvider>
  );
}
