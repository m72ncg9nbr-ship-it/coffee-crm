import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetRecentDeliveries,
  useGetDeliveryDeviations,
  useGetTodayPriorities,
  useListActivityLogs,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge, UrgencyBadge } from "@/components/priority-badge";
import { formatDateTime, formatDate } from "@/lib/utils";
import {
  Users, ShoppingCart, Truck, AlertTriangle, ClipboardCheck, CheckCircle,
  Star, FileWarning, Receipt, AlertCircle,
} from "lucide-react";

export default function DashboardPage() {
  const { data: summary } = useGetDashboardSummary();
  const { data: recentDeliveries } = useGetRecentDeliveries();
  const { data: deviations } = useGetDeliveryDeviations();
  const { data: priorities } = useGetTodayPriorities();
  const { data: activityLogs } = useListActivityLogs({ limit: 15 });

  const s: any = summary ?? {};
  const p: any = priorities ?? {};

  const stats = [
    { label: "Total Customers", value: s.totalCustomers ?? 0, icon: Users, color: "text-blue-600" },
    { label: "A Customers", value: s.aCustomers ?? 0, icon: Star, color: "text-amber-600" },
    { label: "Open Orders", value: s.openOrders ?? 0, icon: ShoppingCart, color: "text-amber-600" },
    { label: "Incomplete", value: s.incompleteOrders ?? 0, icon: FileWarning, color: "text-orange-600" },
    { label: "Planned", value: s.plannedDeliveries ?? 0, icon: Truck, color: "text-purple-600" },
    { label: "Out for Delivery", value: s.outForDelivery ?? 0, icon: Truck, color: "text-yellow-600" },
    { label: "Delayed", value: s.delayedDeliveries ?? 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Awaiting Approval", value: s.awaitingAccountingApproval ?? 0, icon: ClipboardCheck, color: "text-orange-600" },
    { label: "Approved Today", value: s.approvedToday ?? 0, icon: CheckCircle, color: "text-green-600" },
    { label: "Ready for Invoicing", value: s.readyForInvoicing ?? 0, icon: Receipt, color: "text-emerald-600" },
    { label: "Open Deviations", value: s.unresolvedDeviations ?? 0, icon: AlertCircle, color: "text-red-700" },
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
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Operational overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
        {stats.map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                  <Icon className={`h-4 w-4 shrink-0 ${stat.color}`} />
                </div>
                <p className="text-2xl font-bold">{stat.value}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Today's Priorities */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-600" />
            Today's Priorities
            <span className="text-xs text-muted-foreground font-normal">({sectionCount} items)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sectionCount === 0 && (
            <p className="text-sm text-muted-foreground py-2">All caught up — no priority items right now.</p>
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
              <CardTitle className="text-sm font-semibold">Activity</CardTitle>
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
