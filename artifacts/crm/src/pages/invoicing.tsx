import { useGetReadyForInvoicing, useMarkOrderPaid } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PriorityBadge } from "@/components/priority-badge";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { FileCheck, Receipt, CreditCard, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Payment status badge ───────────────────────────────────────────────────────
function PaymentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const map: Record<string, { label: string; className: string }> = {
    paid:    { label: "Paid",    className: "bg-green-100 text-green-800 border-green-200" },
    unpaid:  { label: "Unpaid",  className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    overdue: { label: "Overdue", className: "bg-red-100 text-red-800 border-red-200" },
    partial: { label: "Partial", className: "bg-blue-100 text-blue-800 border-blue-200" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </Badge>
  );
}

// ── Derive display payment status (account for overdue) ────────────────────────
function effectiveStatus(r: any): string {
  if (r.paymentStatus === "paid") return "paid";
  const today = new Date().toISOString().split("T")[0];
  if (r.dueDate && r.dueDate < today) return "overdue";
  return r.paymentStatus ?? "unpaid";
}

export default function InvoicingPage() {
  const { data, isLoading, refetch } = useGetReadyForInvoicing();
  const { toast } = useToast();
  const list = (data ?? []) as any[];

  const markPaid = useMarkOrderPaid({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: "Order marked as paid" });
      },
      onError: () => toast({ title: "Failed to mark as paid", variant: "destructive" }),
    },
  });

  // ── Summary calculations ───────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const totalAmount    = list.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const unpaidList     = list.filter(r => r.paymentStatus !== "paid");
  const overdueList    = list.filter(r => r.paymentStatus !== "paid" && r.dueDate && r.dueDate < today);
  const unpaidAmount   = unpaidList.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const overdueAmount  = overdueList.reduce((s, r) => s + (r.totalAmount ?? 0), 0);
  const collectedAmount = list
    .filter(r => r.paymentStatus === "paid")
    .reduce((s, r) => s + (r.collectedAmount ?? r.totalAmount ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Ready for Invoicing</h1>
        <p className="text-muted-foreground text-sm">
          Approved orders — invoice, due date, and payment tracking
        </p>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total records</p>
            <p className="text-2xl font-bold">{list.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Unpaid</p>
            <p className="text-2xl font-bold text-yellow-700">{unpaidList.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(unpaidAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" />Overdue
            </p>
            <p className="text-2xl font-bold text-red-600">{overdueList.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(overdueAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Receipt className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Collected</p>
              <p className="text-sm font-bold text-green-700">{formatCurrency(collectedAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main table ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Approved Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Order #</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Delivery</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Items</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">Total</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Invoice Date</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Due Date</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Terms</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Payment</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Paid At</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Approved By</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Docs</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">Loading...</td>
                  </tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                      No records ready for invoicing yet
                    </td>
                  </tr>
                )}
                {!isLoading && list.map(r => {
                  const effStatus = effectiveStatus(r);
                  const isOverdue = effStatus === "overdue";
                  const isPaid    = r.paymentStatus === "paid";
                  return (
                    <tr key={r.orderId} className="hover:bg-muted/20">
                      {/* Order # */}
                      <td className="px-3 py-3 font-mono text-xs whitespace-nowrap">{r.orderNumber}</td>

                      {/* Customer */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <PriorityBadge priority={r.customerPriority ?? "C"} />
                          <span className="font-medium whitespace-nowrap">{r.customerName}</span>
                        </div>
                      </td>

                      {/* Delivery (number + date stacked) */}
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        <div className="font-mono">{r.deliveryNumber ?? "—"}</div>
                        <div className="text-muted-foreground">{formatDate(r.scheduledDeliveryDate ?? r.requestedDeliveryDate)}</div>
                      </td>

                      {/* Items */}
                      <td className="px-3 py-3 text-right text-xs">{r.itemCount}</td>

                      {/* Total */}
                      <td className="px-3 py-3 text-right font-medium whitespace-nowrap">{formatCurrency(r.totalAmount)}</td>

                      {/* Invoice Date */}
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.invoiceDate ?? <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* Due Date */}
                      <td className="px-3 py-3 text-xs whitespace-nowrap">
                        {r.dueDate ? (
                          <span className={isOverdue ? "text-red-600 font-semibold" : ""}>
                            {r.dueDate}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Terms */}
                      <td className="px-3 py-3 text-xs whitespace-nowrap text-muted-foreground">
                        {r.paymentTermsDays != null
                          ? r.paymentTermsDays === 0 ? "Cash" : `Net ${r.paymentTermsDays}d`
                          : r.customerPaymentTerms
                            ? r.customerPaymentTerms.replace("_", " ")
                            : "—"}
                      </td>

                      {/* Payment Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <PaymentStatusBadge status={effStatus} />
                        {isPaid && r.collectedAmount != null && r.collectedAmount !== r.totalAmount && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {formatCurrency(r.collectedAmount)}
                          </div>
                        )}
                      </td>

                      {/* Paid At */}
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {r.paidAt ? formatDateTime(r.paidAt) : "—"}
                      </td>

                      {/* Approved By */}
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {r.approvedByName ?? "—"}
                      </td>

                      {/* Documents */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {(r.documents ?? []).length > 0 ? (
                          <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            {r.documents.length} file{r.documents.length === 1 ? "" : "s"}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        {!isPaid ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-green-600 text-green-700 hover:bg-green-50"
                            disabled={markPaid.isPending}
                            onClick={() => markPaid.mutate({ id: r.orderId, data: {} })}
                          >
                            <CreditCard className="h-3 w-3 mr-1" />
                            Mark Paid
                          </Button>
                        ) : (
                          <span className="text-xs text-green-700 font-medium">✓ Paid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
