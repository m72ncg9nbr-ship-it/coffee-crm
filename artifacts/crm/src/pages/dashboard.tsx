import { useGetDashboardSummary, useGetRecentDeliveries, useGetDeliveryDeviations, useListActivityLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, PriorityBadge, UrgencyBadge } from "@/components/priority-badge";
import { formatDateTime, formatDate } from "@/lib/utils";
import { Users, ShoppingCart, Truck, AlertTriangle, ClipboardCheck, CheckCircle } from "lucide-react";

export default function DashboardPage() {
  const { data: summary } = useGetDashboardSummary();
  const { data: recentDeliveries } = useGetRecentDeliveries();
  const { data: deviations } = useGetDeliveryDeviations();
  const { data: activityLogs } = useListActivityLogs({ limit: 15 });

  const stats = [
    { label: "Total Customers", value: summary?.totalCustomers ?? 0, icon: Users, color: "text-blue-600" },
    { label: "Open Orders", value: summary?.openOrders ?? 0, icon: ShoppingCart, color: "text-amber-600" },
    { label: "Planned Deliveries", value: summary?.plannedDeliveries ?? 0, icon: Truck, color: "text-purple-600" },
    { label: "Out for Delivery", value: summary?.outForDelivery ?? 0, icon: Truck, color: "text-yellow-600" },
    { label: "Delayed", value: summary?.delayedDeliveries ?? 0, icon: AlertTriangle, color: "text-red-600" },
    { label: "Awaiting Approval", value: summary?.awaitingAccountingApproval ?? 0, icon: ClipboardCheck, color: "text-orange-600" },
    { label: "Approved Today", value: summary?.approvedToday ?? 0, icon: CheckCircle, color: "text-green-600" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Operational overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
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

      {summary?.priorityDistribution && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Customer Priority Distribution</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-6">
            {(["A", "B", "C"] as const).map(p => (
              <div key={p} className="flex items-center gap-2">
                <PriorityBadge priority={p} />
                <span className="text-sm text-muted-foreground">Priority {p}:</span>
                <span className="font-semibold">{summary.priorityDistribution[p]}</span>
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
