import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Truck,
  ClipboardCheck,
  FileText,
  Activity,
  LogOut,
  Coffee,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "operations", "sales", "accounting"] },
  { href: "/customers", label: "Customers", icon: Users, roles: ["admin", "operations", "sales"] },
  { href: "/leads", label: "Leads", icon: UserPlus, roles: ["admin", "sales"] },
  { href: "/products", label: "Products", icon: Package, roles: ["admin", "operations", "sales"] },
  { href: "/orders", label: "Orders", icon: ShoppingCart, roles: ["admin", "operations", "sales"] },
  { href: "/deliveries", label: "Deliveries", icon: Truck, roles: ["admin", "operations"] },
  { href: "/accounting", label: "Approvals", icon: ClipboardCheck, roles: ["admin", "accounting"] },
  { href: "/activity", label: "Activity", icon: Activity, roles: ["admin", "operations"] },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        window.location.href = "/login";
      }
    }
  });

  const visibleNav = navItems.filter(item => user && item.roles.includes(user.role));

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-60 shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar h-full">
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-sidebar-border">
          <Coffee className="h-6 w-6 text-primary" />
          <div>
            <div className="font-bold text-sidebar-foreground text-sm leading-tight">Coffee CRM</div>
            <div className="text-xs text-muted-foreground">Distribution Hub</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const active = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium cursor-pointer transition-colors mb-0.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-1">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold">
              {user?.fullName?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user?.fullName}</div>
              <div className="text-xs text-muted-foreground capitalize">{user?.role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => logout.mutate(undefined as any)}
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
