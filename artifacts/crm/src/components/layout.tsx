import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useLogout, getGetCurrentUserQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useLang } from "@/lib/lang-context";
import { useChannel, type ChannelFilter } from "@/lib/channel-context";
import { t } from "@/lib/i18n";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Truck,
  ClipboardCheck,
  FileText,
  Receipt,
  Activity,
  LogOut,
  Globe,
  UserPlus,
  Warehouse,
  BarChart2,
  Coffee,
  Sparkles,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Role sets (must mirror server-side constants)
const FULL_ACCESS        = ["owner_admin", "general_manager"];
const FULL_ACCOUNTING    = [...FULL_ACCESS, "accounting"];
const CHANNEL_OPS        = [...FULL_ACCESS, "channel_manager"];
const SALES_CAPABLE      = [...FULL_ACCESS, "channel_manager", "sales"];

export function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location] = useLocation();
  const queryClient = useQueryClient();
  const { lang, setLang } = useLang();
  const { channel, setChannel } = useChannel();

  const navItems = [
    { href: "/action-center", labelKey: "actionCenter"     as const, icon: Zap,            roles: [...SALES_CAPABLE, "accounting"] },
    { href: "/dashboard",     labelKey: "dashboard"        as const, icon: LayoutDashboard, roles: [...SALES_CAPABLE, "accounting"] },
    { href: "/customers",     labelKey: "customers"        as const, icon: Users,           roles: SALES_CAPABLE },
    { href: "/leads",         labelKey: "leads"            as const, icon: UserPlus,        roles: SALES_CAPABLE },
    { href: "/products",      labelKey: "products"         as const, icon: Package,         roles: SALES_CAPABLE },
    { href: "/inventory",     labelKey: "inventory"        as const, icon: Warehouse,       roles: CHANNEL_OPS },
    { href: "/orders",        labelKey: "orders"           as const, icon: ShoppingCart,    roles: SALES_CAPABLE },
    { href: "/deliveries",    labelKey: "deliveries"       as const, icon: Truck,           roles: CHANNEL_OPS },
    { href: "/accounting",    labelKey: "approvals"        as const, icon: ClipboardCheck,  roles: FULL_ACCOUNTING },
    { href: "/invoicing",     labelKey: "readyForInvoicing" as const, icon: Receipt,        roles: FULL_ACCOUNTING },
    { href: "/activity",      labelKey: "activity"         as const, icon: Activity,        roles: CHANNEL_OPS },
    { href: "/reports",       labelKey: "reports"          as const, icon: BarChart2,       roles: ["owner_admin", "general_manager", "accounting", "channel_manager", "sales"] },
  ];

  const logout = useLogout({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        window.location.href = "/login";
      }
    }
  });

  const visibleNav = navItems.filter(item => user && item.roles.includes(user.role));

  const channelOptions: { value: ChannelFilter; label: string; icon: React.ReactNode }[] = [
    { value: "all",       label: t("allChannels", lang), icon: <Globe className="h-3 w-3" /> },
    { value: "coffee",    label: t("coffee", lang),      icon: <Coffee className="h-3 w-3" /> },
    { value: "cosmetics", label: t("cosmetics", lang),   icon: <Sparkles className="h-3 w-3" /> },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-60 shrink-0 flex flex-col border-r border-sidebar-border bg-sidebar h-full">
        {/* Branding */}
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Globe className="h-4.5 w-4.5 text-primary-foreground h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-bold text-sidebar-foreground text-xs leading-tight truncate">NS Global</div>
            <div className="text-[10px] text-sidebar-foreground/50 leading-tight truncate">Operations Hub</div>
          </div>
        </div>

        {/* Channel selector */}
        <div className="px-3 py-2.5 border-b border-sidebar-border">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{t("channel", lang)}</p>
          <div className="flex gap-1">
            {channelOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => setChannel(opt.value)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1 text-[10px] font-medium rounded py-1 px-0.5 transition-colors",
                  channel === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
                title={opt.label}
              >
                {opt.icon}
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          {visibleNav.map(item => {
            const Icon = item.icon;
            const active = location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-pointer transition-all mb-0.5 border-l-2",
                  active
                    ? "border-l-primary bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                    : "border-l-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey, lang)}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Footer: user + language toggle + sign out */}
        <div className="border-t border-sidebar-border">
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {user?.fullName?.charAt(0) ?? "?"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-sidebar-foreground truncate">{user?.fullName}</div>
              <div className="text-xs text-sidebar-foreground/60 capitalize">{user?.role?.replace(/_/g, " ")}</div>
            </div>
          </div>

          <div className="px-3 pb-2 flex items-center justify-between gap-2">
            {/* Language toggle */}
            <div className="flex items-center gap-1">
              <Globe className="h-3.5 w-3.5 text-sidebar-foreground/50 shrink-0 mr-0.5" />
              <button
                onClick={() => setLang("en")}
                className={cn(
                  "text-xs px-2 py-0.5 rounded transition-colors font-medium",
                  lang === "en"
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                )}
              >
                EN
              </button>
              <button
                onClick={() => setLang("tr")}
                className={cn(
                  "text-xs px-2 py-0.5 rounded transition-colors font-medium",
                  lang === "tr"
                    ? "bg-primary text-primary-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
                )}
              >
                TR
              </button>
            </div>

            {/* Sign out */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              onClick={() => logout.mutate(undefined as any)}
            >
              <LogOut className="h-3.5 w-3.5 mr-1.5" />
              {t("signOut", lang)}
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
