import { useListActivityLogs } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { Activity } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  order_created: "bg-blue-100 text-blue-700",
  order_updated: "bg-blue-100 text-blue-700",
  delivery_created: "bg-purple-100 text-purple-700",
  delivery_assigned: "bg-yellow-100 text-yellow-700",
  driver_arrived: "bg-green-100 text-green-700",
  documentation_uploaded: "bg-teal-100 text-teal-700",
  accounting_approved: "bg-green-100 text-green-700",
  accounting_rejected: "bg-red-100 text-red-700",
  invoice_triggered: "bg-emerald-100 text-emerald-700",
  customer_created: "bg-indigo-100 text-indigo-700",
  lead_created: "bg-orange-100 text-orange-700",
};

export default function ActivityPage() {
  const { data: logs, isLoading } = useListActivityLogs({ limit: 100 });

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Activity Log</h1>
        <p className="text-muted-foreground text-sm">{logs?.length ?? 0} recent events</p>
      </div>

      <div className="space-y-2">
        {isLoading && <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>}
        {!isLoading && (logs ?? []).map((log: any) => (
          <Card key={log.id}>
            <CardContent className="p-3.5 flex items-start gap-3">
              <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-0.5 ${ACTION_COLORS[log.actionType] ?? "bg-gray-100 text-gray-600"}`}>
                {log.actionLabel ?? log.actionType.replace(/_/g, " ")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{log.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {log.performedByName} · {formatDateTime(log.createdAt)}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (logs ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No activity yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
