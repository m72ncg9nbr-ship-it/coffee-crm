import { useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetRecentDeliveries,
  useGetDeliveryDeviations,
  useGetTodayPriorities,
  useListActivityLogs,
  useListInventoryStock,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, PriorityBadge, UrgencyBadge } from "@/components/priority-badge";
import { formatDateTime, formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  calculateInventoryStatus,
  invStatusBadgeClass,
  POOL_LABELS,
  type InventoryStatus,
} from "@/lib/inventoryStatus";
import {
  Users, ShoppingCart, Truck, AlertTriangle, ClipboardCheck, CheckCircle,
  Star, FileWarning, Receipt, AlertCircle, Warehouse, Coffee, Sparkles, Globe,
} from "lucide-react";

type DashTab = "general" | "coffee" | "cosmetics";

const TAB_META: { value: DashTab; labelKey: "generalDashboard" | "coffeeDashboard" | "cosmeticsDashboard"; icon: React.ReactNode }[] = [
  { value: "general",   labelKey: "generalDashboard",   icon: <Globe className="h-4 w-4" /> },
  { value: "coffee",    labelKey: "coffeeDashboard",    icon: <Coffee className="h-4 w-4" /> },
  { value: "cosmetics", labelKey: "cosmeticsDashboard", icon: <Sparkles className="h-4 w-4" /> },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { lang } = useLang();
  const [activeTab, setActiveTab] = useState<DashTab>("general");

  const channelParam = activeTab !== "general" ? activeTab : undefined;
  const { data: summary } = useGetDashboardSummary({ channel: channelParam } as any);
  const { data: recentDeliveries } = useGetRecentDeliveries();
  const { data: deviations } = useGetDeliveryDeviations();
  const { data: priorities } = useGetTodayPriorities({ channel: channelParam } as any);
  const { data: activityLogs } = useListActivityLogs({ limit: 15 });
  const { data: stockData } = useListInventoryStock();

  const showStockOverview = !!user && ["owner_admin", "general_manager", "channel_manager"].includes(user.role);

  type StockAlert = {
    productId: number;
    productName: string;
    sku: string;
    poolName: string;
    poolLabel: string;
    allocated: number;
    available: number;
    reserved: number;
    status: InventoryStatus;
    statusLabel: string;
  };

  const stockAlerts: StockAlert[] = [];
  if (showStockOverview && stockData) {
    for (const item of stockData as any[]) {
      for (const pool of item.pools ?? []) {
        const { status, label, allocated } = calculateInventoryStatus(
          pool.quantityAvailable,
          pool.quantityReserved,
        );
        if (status === "out_of_stock" || status === "low_stock") {
          stockAlerts.push({
            productId: item.productId,
            productName: item.productName,
            sku: item.sku,
            poolName: pool.poolName,
            poolLabel: pool.poolLabel ?? POOL_LABELS[pool.poolName] ?? pool.poolName,
            allocated,
            available: pool.quantityAvailable,
            reserved: pool.quantityReserved,
            status,
            statusLabel: label,
          });
        }
      }
    }
    stockAlerts.sort((a, b) => {
      if (a.status !== b.status) return a.status === "out_of_stock" ? -1 : 1;
      return a.productName.localeCompare(b.productName);
    });
  }

  const s: any = summary ?? {};
  const p: any = priorities ?? {};

  const stats = [
    { labelKey: "totalCustomers"  as const, value: s.totalCustomers ?? 0,               icon: Users,         color: "text-blue-600" },
    { labelKey: "aCustomers"      as const, value: s.aCustomers ?? 0,                   icon: Star,          color: "text-amber-600" },
    { labelKey: "openOrders"      as const, value: s.openOrders ?? 0,                   icon: ShoppingCart,  color: "text-amber-600" },
    { labelKey: "incomplete"      as const, value: s.incompleteOrders ?? 0,             icon: FileWarning,   color: "text-orange-600" },
    { labelKey: "planned"         as const, value: s.plannedDeliveries ?? 0,            icon: Truck,         color: "text-purple-600" },
    { labelKey: "outForDelivery"  as const, value: s.outForDelivery ?? 0,               icon: Truck,         color: "text-yellow-600" },
    { labelKey: "delayed"         as const, value: s.delayedDeliveries ?? 0,            icon: AlertTriangle, color: "text-red-600" },
    { labelKey: "awaitingApproval" as const, value: s.awaitingAccountingApproval ?? 0, icon: ClipboardCheck, color: "text-orange-600" },
    { labelKey: "approvedToday"   as const, value: s.approvedToday ?? 0,               icon: CheckCircle,   color: "text-green-600" },
    { labelKey: "readyInvoicing"  as const, value: s.readyForInvoicing ?? 0,           icon: Receipt,       color: "text-emerald-600" },
    { labelKey: "openDeviations"  as const, value: s.unresolvedDeviations ?? 0,        icon: AlertCircle,   color: "text-red-700" },
  ];

  const sectionCount = (p.aCustomerDeliveries?.length ?? 0)
    + (p.urgentOrders?.length ?? 0)
    + (p.delayedDeliveries?.length ?? 0)
    + (p.unassignedDeliveries?.length ?? 0)
    + (p.awaitingApproval?.length ?? 0)
    + (p.unresolvedDeviations?.length ?? 0)
    + (p.overdueLeadFollowUps?.length ?? 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("dashboard", lang)}</h1>
        <p className="text-muted-foreground text-sm mt-0.5">{t("operationalOverview", lang)}</p>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1 border-b pb-0">
        {TAB_META.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              activeTab === tab.value
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
            )}
          >
            {tab.icon}
            {t(tab.labelKey, lang)}
          </button>
        ))}
      </div>

      {/* Channel context indicator */}
      {activeTab !== "general" && (
        <div className={`rounded-lg border px-4 py-2.5 flex items-center gap-2 text-sm ${
          activeTab === "cosmetics"
            ? "border-purple-200 bg-purple-50/40 text-purple-800"
            : "border-amber-200 bg-amber-50/40 text-amber-800"
        }`}>
          {activeTab === "cosmetics" ? <Sparkles className="h-4 w-4" /> : <Coffee className="h-4 w-4" />}
          <span className="font-medium capitalize">{activeTab} channel</span>
          <span className="text-xs opacity-70">— metrics filtered to {activeTab} orders and deliveries only</span>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.labelKey} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-muted-foreground leading-tight">{t(stat.labelKey, lang)}</p>
                  <Icon className={`h-4 w-4 shrink-0 ${stat.color}`} />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Stock Overview */}
      {showStockOverview && stockData && (
        <Card className={stockAlerts.length > 0 ? "border-amber-300" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              {t("stockOverview", lang)}
              {stockAlerts.length > 0 && (
                <span className="text-xs text-muted-foreground font-normal">
                  ({stockAlerts.filter(a => a.status === "out_of_stock").length} {t("outOfStock", lang)},{" "}
                  {stockAlerts.filter(a => a.status === "low_stock").length} {t("lowStock", lang)})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stockAlerts.length === 0 ? (
              <p className="text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle className="h-4 w-4" />
                {t("allPoolsHealthy", lang)}
              </p>
            ) : (
              <div className="divide-y">
                {stockAlerts.map((a, i) => {
                  const badgeCls = invStatusBadgeClass(a.status);
                  const pct = a.allocated > 0
                    ? Math.round((a.available / a.allocated) * 100)
                    : 0;
                  return (
                    <div key={i} className="py-2.5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight">{a.productName}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{a.sku}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t("pool", lang)}: <span className="font-medium">{a.poolLabel}</span>
                          <span className="mx-1.5 opacity-40">·</span>
                          {t("allocated", lang)}: <span className="font-medium">{a.allocated}</span>
                          <span className="mx-1.5 opacity-40">·</span>
                          {t("reserved", lang)}: <span className="font-medium">{a.reserved}</span>
                          <span className="mx-1.5 opacity-40">·</span>
                          {t("available", lang)}: <span className="font-medium">{a.available}</span>
                          {a.allocated > 0 && (
                            <span className="text-muted-foreground/60"> ({pct}%)</span>
                          )}
                        </p>
                      </div>
                      <Badge className={`${badgeCls} text-[10px] shrink-0 mt-0.5`}>
                        {a.statusLabel}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Today's Priorities */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-600" />
            {t("todaysPriorities", lang)}
            <span className="text-xs text-muted-foreground font-normal">({sectionCount} {t("items", lang)})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sectionCount === 0 && (
            <p className="text-sm text-muted-foreground py-2">{t("noPriorities", lang)}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <PriorityList title="A Customers awaiting delivery" empty="No A customers waiting" items={p.aCustomerDeliveries ?? []} render={(it: any) => (
              <Link href="/deliveries"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md">
                <p className="text-sm font-medium">{it.customerName}</p>
                <p className="text-xs text-muted-foreground">{it.deliveryNumber} · {formatDate(it.scheduledDate)} · <span className="capitalize">{it.status}</span></p>
              </div></Link>
            )} />

            <PriorityList title="Urgent / critical orders" empty="No urgent orders" items={p.urgentOrders ?? []} render={(it: any) => (
              <Link href="/orders"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md flex items-center gap-2">
                <UrgencyBadge urgency={it.urgency} />
                <div>
                  <p className="text-sm font-medium">{it.customerName}</p>
                  <p className="text-xs text-muted-foreground">{it.orderNumber} · <span className="capitalize">{it.status?.replace(/_/g, " ")}</span></p>
                </div>
              </div></Link>
            )} />

            <PriorityList title="Delayed deliveries" empty="No delays" items={p.delayedDeliveries ?? []} render={(it: any) => (
              <Link href="/deliveries"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md">
                <p className="text-sm font-medium">{it.customerName}</p>
                <p className="text-xs text-red-700">⚠ Was due {formatDate(it.scheduledDate)} · <span className="capitalize">{it.status}</span></p>
              </div></Link>
            )} />

            <PriorityList title="Unassigned deliveries" empty="None waiting" items={p.unassignedDeliveries ?? []} render={(it: any) => (
              <Link href="/deliveries"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md flex items-center gap-2">
                <PriorityBadge priority={it.customerPriority} />
                <div>
                  <p className="text-sm font-medium">{it.customerName}</p>
                  <p className="text-xs text-muted-foreground">{it.deliveryNumber} · {formatDate(it.scheduledDate)}</p>
                </div>
              </div></Link>
            )} />

            <PriorityList title="Awaiting accounting approval" empty="None pending" items={p.awaitingApproval ?? []} render={(it: any) => (
              <Link href="/accounting"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md">
                <p className="text-sm font-medium">{it.customerName}</p>
                <p className="text-xs text-muted-foreground">{it.orderNumber} / {it.deliveryNumber}</p>
              </div></Link>
            )} />

            <PriorityList title="Open deviations" empty="No open deviations" items={p.unresolvedDeviations ?? []} render={(it: any) => (
              <Link href="/deliveries"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md">
                <p className="text-sm font-medium">{it.customerName}</p>
                <p className="text-xs text-red-700 capitalize">{it.deviationType?.replace(/_/g, " ")}</p>
                {it.deviationNote && <p className="text-xs text-muted-foreground line-clamp-1">{it.deviationNote}</p>}
              </div></Link>
            )} />

            <PriorityList title="Lead follow-ups due" empty="No follow-ups due" items={p.overdueLeadFollowUps ?? []} render={(it: any) => (
              <Link href="/leads"><div className="cursor-pointer hover:bg-muted/30 px-2 py-1.5 rounded-md">
                <p className="text-sm font-medium">{it.companyName}</p>
                <p className="text-xs text-muted-foreground">{it.contactPerson} · <span className="text-amber-700">due {formatDate(it.followUpDueAt)}</span></p>
              </div></Link>
            )} />
          </div>
        </CardContent>
      </Card>

      {summary?.priorityDistribution && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Customer Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
            {(["A", "B", "C"] as const).map(prio => (
              <div key={prio} className="flex items-center gap-2">
                <PriorityBadge priority={prio} />
                <span className="text-sm text-muted-foreground">Priority {prio}:</span>
                <span className="font-semibold">{summary.priorityDistribution[prio]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {(recentDeliveries ?? []).slice(0, 8).map((d: any) => (
                <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <PriorityBadge priority={d.customerPriority} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{d.customerName}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(d.scheduledDate)}</p>
                  </div>
                  <UrgencyBadge urgency={d.urgency} />
                  <StatusBadge status={d.status} />
                </div>
              ))}
              {(!recentDeliveries || recentDeliveries.length === 0) && (
                <p className="text-sm text-muted-foreground px-4 py-8 text-center">No recent deliveries</p>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-red-700">Deviations</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {(deviations ?? []).slice(0, 5).map((d: any) => (
                  <div key={d.id} className="px-4 py-3">
                    <p className="text-sm font-medium truncate">{d.customerName}</p>
                    <p className="text-xs text-orange-700 mt-0.5 capitalize">{d.deviationType?.replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{d.deviationNote}</p>
                  </div>
                ))}
                {(!deviations || deviations.length === 0) && (
                  <p className="text-sm text-muted-foreground px-4 py-6 text-center">No deviations</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">{t("activity", lang)}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y max-h-64 overflow-y-auto">
                {(activityLogs ?? []).slice(0, 10).map((log: any) => (
                  <div key={log.id} className="px-4 py-2.5">
                    <p className="text-xs text-foreground line-clamp-2">{log.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{log.performedByName} · {formatDateTime(log.createdAt)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function PriorityList({ title, empty, items, render }: {
  title: string;
  empty: string;
  items: any[];
  render: (it: any) => React.ReactNode;
}) {
  return (
    <div className="bg-background rounded-md border p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">{empty}</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {items.slice(0, 6).map((it, i) => <div key={i}>{render(it)}</div>)}
          {items.length > 6 && <p className="text-xs text-muted-foreground px-2 pt-1">+{items.length - 6} more</p>}
        </div>
      )}
    </div>
  );
}
