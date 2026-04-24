import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CustomersPage from "@/pages/customers/index";
import CustomerDetailPage from "@/pages/customers/detail";
import OrdersPage from "@/pages/orders/index";
import DeliveriesPage from "@/pages/deliveries/index";
import LeadsPage from "@/pages/leads";
import ProductsPage from "@/pages/products";
import AccountingPage from "@/pages/accounting";
import ActivityPage from "@/pages/activity";
import DriverPage from "@/pages/driver";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }
});

const ROLE_DEFAULT: Record<string, string> = {
  admin: "/dashboard",
  operations: "/dashboard",
  sales: "/dashboard",
  driver: "/driver",
  accounting: "/accounting",
};

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-muted-foreground text-sm">Loading...</div>
    </div>
  );

  if (!user) return <Redirect to="/login" />;

  if (roles && !roles.includes(user.role)) {
    const defaultPath = ROLE_DEFAULT[user.role] ?? "/dashboard";
    return <Redirect to={defaultPath} />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      <Route path="/driver">
        <ProtectedRoute roles={["driver"]}>
          <DriverPage />
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute roles={["admin", "operations", "sales", "accounting"]}>
          <Layout><DashboardPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/customers/:id">
        <ProtectedRoute roles={["admin", "operations", "sales"]}>
          <Layout><CustomerDetailPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/customers">
        <ProtectedRoute roles={["admin", "operations", "sales"]}>
          <Layout><CustomersPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/orders">
        <ProtectedRoute roles={["admin", "operations", "sales"]}>
          <Layout><OrdersPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/deliveries">
        <ProtectedRoute roles={["admin", "operations"]}>
          <Layout><DeliveriesPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/leads">
        <ProtectedRoute roles={["admin", "sales"]}>
          <Layout><LeadsPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/products">
        <ProtectedRoute roles={["admin", "operations", "sales"]}>
          <Layout><ProductsPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/accounting">
        <ProtectedRoute roles={["admin", "accounting"]}>
          <Layout><AccountingPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/activity">
        <ProtectedRoute roles={["admin", "operations"]}>
          <Layout><ActivityPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/">
        {!isLoading && user ? (
          <Redirect to={ROLE_DEFAULT[user.role] ?? "/dashboard"} />
        ) : !isLoading ? (
          <Redirect to="/login" />
        ) : null}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
