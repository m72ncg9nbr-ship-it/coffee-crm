import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/lang-context";
import { ChannelProvider } from "@/lib/channel-context";
import { Layout } from "@/components/layout";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import CustomersPage from "@/pages/customers/index";
import CustomerDetailPage from "@/pages/customers/detail";
import OrdersPage from "@/pages/orders/index";
import OrderNewPage from "@/pages/orders/new";
import OrderDetailPage from "@/pages/orders/detail";
import DeliveriesPage from "@/pages/deliveries/index";
import LeadsPage from "@/pages/leads";
import ProductsPage from "@/pages/products";
import InventoryPage from "@/pages/inventory";
import AccountingPage from "@/pages/accounting";
import InvoicingPage from "@/pages/invoicing";
import ActivityPage from "@/pages/activity";
import ReportsPage from "@/pages/reports";
import DriverPage from "@/pages/driver";
import ActionCenterPage from "@/pages/action-center";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } }
});

const ROLE_DEFAULT: Record<string, string> = {
  owner_admin:     "/dashboard",
  general_manager: "/dashboard",
  channel_manager: "/dashboard",
  sales:           "/dashboard",
  driver:          "/driver",
  accounting:      "/accounting",
};

// Role sets (mirrors server-side constants and layout.tsx)
const FULL_ACCESS     = ["owner_admin", "general_manager"];
const FULL_ACCOUNTING = [...FULL_ACCESS, "accounting"];
const CHANNEL_OPS     = [...FULL_ACCESS, "channel_manager"];
const SALES_CAPABLE   = [...FULL_ACCESS, "channel_manager", "sales"];

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

      <Route path="/action-center">
        <ProtectedRoute roles={[...SALES_CAPABLE, "accounting"]}>
          <Layout><ActionCenterPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/dashboard">
        <ProtectedRoute roles={[...SALES_CAPABLE, "accounting"]}>
          <Layout><DashboardPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/customers/:id">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><CustomerDetailPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/customers">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><CustomersPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/orders/new">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><OrderNewPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/orders/:id">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><OrderDetailPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/orders">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><OrdersPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/deliveries">
        <ProtectedRoute roles={CHANNEL_OPS}>
          <Layout><DeliveriesPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/leads">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><LeadsPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/products">
        <ProtectedRoute roles={SALES_CAPABLE}>
          <Layout><ProductsPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/inventory">
        <ProtectedRoute roles={CHANNEL_OPS}>
          <Layout><InventoryPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/accounting">
        <ProtectedRoute roles={FULL_ACCOUNTING}>
          <Layout><AccountingPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/invoicing">
        <ProtectedRoute roles={FULL_ACCOUNTING}>
          <Layout><InvoicingPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/activity">
        <ProtectedRoute roles={CHANNEL_OPS}>
          <Layout><ActivityPage /></Layout>
        </ProtectedRoute>
      </Route>

      <Route path="/reports">
        <ProtectedRoute roles={["owner_admin", "general_manager", "accounting", "channel_manager", "sales"]}>
          <Layout><ReportsPage /></Layout>
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
        <LanguageProvider>
          <ChannelProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <AuthProvider>
                <AppRoutes />
              </AuthProvider>
            </WouterRouter>
            <Toaster />
          </ChannelProvider>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
