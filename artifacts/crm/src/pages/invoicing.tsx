import { useGetReadyForInvoicing } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PriorityBadge } from "@/components/priority-badge";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { FileCheck, Receipt } from "lucide-react";

export default function InvoicingPage() {
  const { data, isLoading } = useGetReadyForInvoicing();
  const list = (data ?? []) as any[];

  const total = list.reduce((sum, r) => sum + (r.totalAmount ?? 0), 0);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Ready for Invoicing</h1>
        <p className="text-muted-foreground text-sm">
          Orders approved by accounting and ready to be invoiced
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Records</p>
          <p className="text-2xl font-bold">{list.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Amount</p>
          <p className="text-2xl font-bold">{formatCurrency(total)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <Receipt className="h-8 w-8 text-green-600" />
          <div>
            <p className="text-xs text-muted-foreground">Invoice Basis</p>
            <p className="text-sm font-medium">Approved + Documented</p>
          </div>
        </CardContent></Card>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Order #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Delivery #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Delivery Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Items</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Approved By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Triggered At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Documents</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
                )}
                {!isLoading && list.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                    No records ready for invoicing yet
                  </td></tr>
                )}
                {!isLoading && list.map(r => (
                  <tr key={r.orderId} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{r.orderNumber}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={r.customerPriority ?? "C"} />
                        <span className="font-medium">{r.customerName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{r.deliveryNumber ?? "—"}</td>
                    <td className="px-4 py-3">{formatDate(r.scheduledDeliveryDate ?? r.requestedDeliveryDate)}</td>
                    <td className="px-4 py-3">{r.itemCount}</td>
                    <td className="px-4 py-3 font-medium">{formatCurrency(r.totalAmount)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.approvedByName ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{r.invoiceTriggeredAt ? formatDateTime(r.invoiceTriggeredAt) : "—"}</td>
                    <td className="px-4 py-3">
                      {(r.documents ?? []).length > 0 ? (
                        <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          {r.documents.length} file{r.documents.length === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">none</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
