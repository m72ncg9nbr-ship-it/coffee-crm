import { useListAccountingApprovals, useApproveDelivery, useRejectDelivery, useMarkOrderPaid } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/priority-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, FileText, CreditCard } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

export default function AccountingPage() {
  const { data: approvals, isLoading, refetch } = useListAccountingApprovals();
  const { toast } = useToast();
  const { user } = useAuth();
  const [notes, setNotes] = useState<Record<number, string>>({});

  const approveDelivery = useApproveDelivery({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Delivery approved" }); },
      onError: () => toast({ title: "Failed to approve", variant: "destructive" })
    }
  });

  const rejectDelivery = useRejectDelivery({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Delivery rejected" }); },
      onError: () => toast({ title: "Failed to reject", variant: "destructive" })
    }
  });

  const markPaid = useMarkOrderPaid({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: "Order marked as paid" }); },
      onError: () => toast({ title: "Failed to mark as paid", variant: "destructive" })
    }
  });

  const handleApprove = (deliveryId: number) => {
    approveDelivery.mutate({ deliveryId, data: { reviewNotes: notes[deliveryId] } });
  };
  const handleReject = (deliveryId: number) => {
    rejectDelivery.mutate({ deliveryId, data: { reviewNotes: notes[deliveryId] ?? "Rejected" } });
  };
  const handleMarkPaid = (orderId: number) => {
    markPaid.mutate({ id: orderId, data: {} });
  };

  // Only accounting roles can mark paid
  const canMarkPaid = user?.role && ["admin", "accounting"].includes(user.role);

  const pending = (approvals ?? []).filter((a: any) => a.status === "pending");
  const reviewed = (approvals ?? []).filter((a: any) => a.status !== "pending");
  const isBusy = approveDelivery.isPending || rejectDelivery.isPending || markPaid.isPending;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Accounting Approvals</h1>
        <p className="text-muted-foreground text-sm">{pending.length} pending approval{pending.length !== 1 ? "s" : ""}</p>
      </div>

      {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>}

      {!isLoading && (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">Pending Review</h2>
              {pending.map((a: any) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  note={notes[a.deliveryId] ?? ""}
                  onNoteChange={n => setNotes(prev => ({ ...prev, [a.deliveryId]: n }))}
                  onApprove={() => handleApprove(a.deliveryId)}
                  onReject={() => handleReject(a.deliveryId)}
                  isPending={isBusy}
                />
              ))}
            </div>
          )}

          {reviewed.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Reviewed</h2>
              {reviewed.map((a: any) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  readonly
                  canMarkPaid={canMarkPaid}
                  onMarkPaid={a.orderId ? () => handleMarkPaid(a.orderId) : undefined}
                  isPending={isBusy}
                />
              ))}
            </div>
          )}

          {(approvals ?? []).length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No approval requests</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    paid:    { label: "Paid", className: "bg-green-100 text-green-800 border-green-200" },
    unpaid:  { label: "Unpaid", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={`text-xs ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

function ApprovalCard({ approval: a, note, onNoteChange, onApprove, onReject, onMarkPaid, isPending, readonly, canMarkPaid }: {
  approval: any;
  note?: string;
  onNoteChange?: (n: string) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onMarkPaid?: () => void;
  isPending?: boolean;
  readonly?: boolean;
  canMarkPaid?: boolean | null;
}) {
  const showMarkPaid =
    readonly &&
    canMarkPaid &&
    a.status === "approved" &&
    a.orderId &&
    a.paymentStatus !== "paid" &&
    onMarkPaid;

  return (
    <Card className={a.status === "approved" ? "border-green-200" : a.status === "rejected" ? "border-red-200" : "border-amber-200"}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{a.customerName}</span>
              <StatusBadge status={a.status} />
              {a.orderNumber && <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">{a.orderNumber}</span>}
              {a.deliveryNumber && <span className="text-xs font-mono bg-muted text-muted-foreground px-2 py-0.5 rounded">{a.deliveryNumber}</span>}
              {typeof a.orderTotalAmount === "number" && (
                <span className="text-xs font-semibold text-foreground">
                  {new Intl.NumberFormat("nb-NO", { style: "currency", currency: "NOK" }).format(a.orderTotalAmount)}
                </span>
              )}
              {a.status === "approved" && a.paymentStatus && (
                <PaymentStatusBadge status={a.paymentStatus} />
              )}
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
              <span>Scheduled: {formatDate(a.scheduledDate)}</span>
              <span>Driver: {a.driverName ?? "—"}</span>
              {a.status === "approved" && a.invoiceDate && (
                <span>Invoice: {a.invoiceDate}</span>
              )}
              {a.status === "approved" && a.dueDate && (
                <span className={
                  a.paymentStatus !== "paid" && a.dueDate < new Date().toISOString().split("T")[0]
                    ? "text-red-600 font-medium"
                    : ""
                }>
                  Due: {a.dueDate}
                </span>
              )}
              {a.hasDocument && a.documentUrl && (
                <a href={a.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-700 hover:underline">
                  <FileText className="h-3 w-3" />
                  View document
                </a>
              )}
              {a.hasDocument && !a.documentUrl && (
                <span className="flex items-center gap-1 text-green-700">
                  <FileText className="h-3 w-3" />
                  Document uploaded
                </span>
              )}
              {!a.hasDocument && (
                <span className="text-amber-700">No document</span>
              )}
            </div>
            {Array.isArray(a.orderItems) && a.orderItems.length > 0 && (
              <div className="text-xs bg-muted/30 rounded px-2 py-1.5 border">
                <span className="font-medium text-muted-foreground">Items: </span>
                {a.orderItems.map((it: any, idx: number) => (
                  <span key={idx}>
                    {idx > 0 && <span className="text-muted-foreground"> · </span>}
                    <span>{it.productName} <span className="text-muted-foreground">×{it.quantity}</span></span>
                  </span>
                ))}
              </div>
            )}
            {a.deviationNote && (
              <div className="text-xs text-orange-700 bg-orange-50 rounded px-2 py-1.5">
                <span className="font-medium capitalize">{a.deviationType?.replace(/_/g, " ")}: </span>
                {a.deviationNote}
              </div>
            )}
            {readonly && a.reviewNotes && (
              <p className="text-xs text-muted-foreground italic">"{a.reviewNotes}"</p>
            )}
            {readonly && a.reviewedAt && (
              <p className="text-xs text-muted-foreground">Reviewed: {formatDateTime(a.reviewedAt)} {a.reviewedByName ? `by ${a.reviewedByName}` : ""}</p>
            )}
            {readonly && a.status === "approved" && a.paidAt && (
              <p className="text-xs text-green-700">Paid: {formatDateTime(a.paidAt)}</p>
            )}
          </div>
          {!readonly && (
            <div className="flex flex-col gap-2 min-w-52">
              <textarea
                className="w-full text-xs border rounded p-2 resize-none h-16 bg-background"
                placeholder="Review notes (optional)..."
                value={note ?? ""}
                onChange={e => onNoteChange?.(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={onApprove}
                  disabled={isPending}
                >
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={onReject}
                  disabled={isPending}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  Reject
                </Button>
              </div>
            </div>
          )}
          {showMarkPaid && (
            <Button
              size="sm"
              variant="outline"
              className="border-green-600 text-green-700 hover:bg-green-50"
              onClick={onMarkPaid}
              disabled={isPending}
            >
              <CreditCard className="h-3.5 w-3.5 mr-1" />
              Mark as Paid
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
