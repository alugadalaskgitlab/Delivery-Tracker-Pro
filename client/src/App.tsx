import { Route, Switch, Router } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toaster";
import { queryClient } from "./lib/queryClient";
import NotFound from "@/pages/not-found";
import Home from "./pages/home";
import AdminDashboard from "./pages/admin-dashboard";
import PlantDispatch from "./pages/plant-dispatch";
import SiteDispatch from "./pages/site-dispatch";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <TooltipProvider>
          <Toaster />
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/plant" component={PlantDispatch} />
            <Route path="/site" component={SiteDispatch} />
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
      </Router>
    </QueryClientProvider>
  );
}
