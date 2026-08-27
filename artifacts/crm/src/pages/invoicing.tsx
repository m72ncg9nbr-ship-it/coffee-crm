import { useState, useMemo } from "react";
import { useGetReadyForInvoicing, useMarkOrderPaid } from "@workspace/api-client-react";
import { useChannel } from "@/lib/channel-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PriorityBadge } from "@/components/priority-badge";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/utils";
import { FileCheck, Receipt, CreditCard, AlertCircle, X, SlidersHorizontal, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { paymentTermsDisplayLabel } from "@/lib/customer-options";

// ── Payment status badge ───────────────────────────────────────────────────────
function PaymentStatusBadge({ status }: { status?: string | null }) {
  const { lang } = useLang();
  if (!status) return null;
  const map: Record<string, { labelKey: "paid" | "unpaid" | "overdue" | "partialPayment"; className: string }> = {
    paid:    { labelKey: "paid",           className: "bg-green-100 text-green-800 border-green-200" },
    unpaid:  { labelKey: "unpaid",         className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    overdue: { labelKey: "overdue",        className: "bg-red-100 text-red-800 border-red-200" },
    partial: { labelKey: "partialPayment", className: "bg-blue-100 text-blue-800 border-blue-200" },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={`text-xs font-medium ${cfg?.className ?? "bg-muted text-muted-foreground"}`}>
      {cfg ? t(cfg.labelKey, lang) : status}
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

type SortKey = "orderNumber" | "customer" | "deliveryDate" | "invoiceDate" | "dueDate" | "total" | "payment" | "approvedBy";
type SortDir = "asc" | "desc";

function sortRows(list: any[], key: SortKey, dir: SortDir): any[] {
  return [...list].sort((a, b) => {
    let va: any, vb: any;
    switch (key) {
      case "orderNumber":   va = a.orderNumber ?? ""; vb = b.orderNumber ?? ""; break;
      case "customer":      va = a.customerName ?? ""; vb = b.customerName ?? ""; break;
      case "deliveryDate":  va = a.scheduledDeliveryDate ?? a.requestedDeliveryDate ?? ""; vb = b.scheduledDeliveryDate ?? b.requestedDeliveryDate ?? ""; break;
      case "invoiceDate":   va = a.invoiceDate ?? ""; vb = b.invoiceDate ?? ""; break;
      case "dueDate":       va = a.dueDate ?? ""; vb = b.dueDate ?? ""; break;
      case "total":         va = a.totalAmount ?? 0; vb = b.totalAmount ?? 0; return dir === "asc" ? va - vb : vb - va;
      case "payment":       va = effectiveStatus(a); vb = effectiveStatus(b); break;
      case "approvedBy":    va = a.approvedByName ?? ""; vb = b.approvedByName ?? ""; break;
      default: return 0;
    }
    const cmp = String(va).localeCompare(String(vb));
    return dir === "asc" ? cmp : -cmp;
  });
}

function ColHeader({ label, col, sortKey, sortDir, onSort }: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  return (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(col)}
    >
      <span className="flex items-center gap-1">
        {label}
        {!active && <ArrowUpDown className="h-3 w-3 opacity-40" />}
        {active && sortDir === "asc"  && <ArrowUp   className="h-3 w-3 text-primary" />}
        {active && sortDir === "desc" && <ArrowDown className="h-3 w-3 text-primary" />}
      </span>
    </th>
  );
}

export default function InvoicingPage() {
  const { data, isLoading, refetch } = useGetReadyForInvoicing();
  const { toast } = useToast();
  const { channel } = useChannel();
  const { lang } = useLang();
  const rawList = (data ?? []) as any[];
  const list = useMemo(() => {
    if (channel === "cosmetics") return rawList.filter(r => r.businessChannel === "cosmetics");
    if (channel === "coffee") return rawList.filter(r => r.businessChannel !== "cosmetics");
    return rawList;
  }, [rawList, channel]);

  // ── Filter state ───────────────────────────────────────────────────────────
  const [orderSearch,    setOrderSearch]    = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [deliverySearch, setDeliverySearch] = useState("");
  const [delivDateFrom,  setDelivDateFrom]  = useState("");
  const [delivDateTo,    setDelivDateTo]    = useState("");
  const [invDateFrom,    setInvDateFrom]    = useState("");
  const [invDateTo,      setInvDateTo]      = useState("");
  const [dueDateFrom,    setDueDateFrom]    = useState("");
  const [dueDateTo,      setDueDateTo]      = useState("");
  const [paymentFilter,  setPaymentFilter]  = useState("all");
  const [docsFilter,     setDocsFilter]     = useState("all");
  const [totalMin,       setTotalMin]       = useState("");
  const [totalMax,       setTotalMax]       = useState("");

  // ── Sort state ─────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("invoiceDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  const markPaid = useMarkOrderPaid({
    mutation: {
      onSuccess: () => {
        refetch();
        toast({ title: t("orderMarkedAsPaid", lang) });
      },
      onError: () => toast({ title: t("failedToMarkAsPaid", lang), variant: "destructive" }),
    },
  });

  // ── Filter pipeline ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return list.filter(r => {
      if (orderSearch.trim()    && !r.orderNumber?.toLowerCase().includes(orderSearch.toLowerCase()))    return false;
      if (customerSearch.trim() && !r.customerName?.toLowerCase().includes(customerSearch.toLowerCase())) return false;
      if (deliverySearch.trim() && !r.deliveryNumber?.toLowerCase().includes(deliverySearch.toLowerCase())) return false;
      const delivDate = r.scheduledDeliveryDate ?? r.requestedDeliveryDate ?? "";
      if (delivDateFrom && delivDate && delivDate < delivDateFrom) return false;
      if (delivDateTo   && delivDate && delivDate > delivDateTo)   return false;
      if (invDateFrom && r.invoiceDate && r.invoiceDate < invDateFrom) return false;
      if (invDateTo   && r.invoiceDate && r.invoiceDate > invDateTo)   return false;
      if (dueDateFrom && r.dueDate && r.dueDate < dueDateFrom) return false;
      if (dueDateTo   && r.dueDate && r.dueDate > dueDateTo)   return false;
      const eff = effectiveStatus(r);
      if (paymentFilter !== "all" && eff !== paymentFilter) return false;
      if (docsFilter === "with_docs"    && !(r.documents?.length > 0)) return false;
      if (docsFilter === "without_docs" && (r.documents?.length > 0))  return false;
      if (totalMin.trim() && r.totalAmount < parseFloat(totalMin)) return false;
      if (totalMax.trim() && r.totalAmount > parseFloat(totalMax)) return false;
      return true;
    });
  }, [list, orderSearch, customerSearch, deliverySearch, delivDateFrom, delivDateTo, invDateFrom, invDateTo, dueDateFrom, dueDateTo, paymentFilter, docsFilter, totalMin, totalMax]);

  const sorted = useMemo(() => sortRows(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  const hasFilters = orderSearch || customerSearch || deliverySearch || delivDateFrom || delivDateTo || invDateFrom || invDateTo || dueDateFrom || dueDateTo || paymentFilter !== "all" || docsFilter !== "all" || totalMin || totalMax;

  function clearFilters() {
    setOrderSearch(""); setCustomerSearch(""); setDeliverySearch("");
    setDelivDateFrom(""); setDelivDateTo(""); setInvDateFrom(""); setInvDateTo("");
    setDueDateFrom(""); setDueDateTo(""); setPaymentFilter("all");
    setDocsFilter("all"); setTotalMin(""); setTotalMax("");
  }

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
        <h1 className="text-2xl font-bold">{t("invoicing", lang)}</h1>
        <p className="text-muted-foreground text-sm">
          {t("invoicingSubtitle", lang)}
        </p>
      </div>

      {/* ── Summary cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("totalRecords", lang)}</p>
            <p className="text-2xl font-bold">{list.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">{t("unpaid", lang)}</p>
            <p className="text-2xl font-bold text-yellow-700">{unpaidList.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(unpaidAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3 text-red-500" />{t("overdue", lang)}
            </p>
            <p className="text-2xl font-bold text-red-600">{overdueList.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(overdueAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Receipt className="h-8 w-8 text-green-600 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{t("collected", lang)}</p>
              <p className="text-sm font-bold text-green-700">{formatCurrency(collectedAmount)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{t("filters", lang)}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder={t("searchOrder", lang)}    value={orderSearch}    onChange={e => setOrderSearch(e.target.value)}    className="h-8 text-xs w-28" />
          <Input placeholder={t("searchCustomer", lang)} value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} className="h-8 text-xs w-40" />
          <Input placeholder={t("searchDelivery", lang)} value={deliverySearch} onChange={e => setDeliverySearch(e.target.value)} className="h-8 text-xs w-32" />
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("allPayments", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allPayments", lang)}</SelectItem>
              <SelectItem value="paid">{t("paid", lang)}</SelectItem>
              <SelectItem value="unpaid">{t("unpaid", lang)}</SelectItem>
              <SelectItem value="overdue">{t("overdue", lang)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={docsFilter} onValueChange={setDocsFilter}>
            <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder={t("allDocsFilter", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allDocsFilter", lang)}</SelectItem>
              <SelectItem value="with_docs">{t("withDocsFilter", lang)}</SelectItem>
              <SelectItem value="without_docs">{t("noDocsFilter", lang)}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("deliveryHeader", lang)}</span>
          <Input type="date" value={delivDateFrom} onChange={e => setDelivDateFrom(e.target.value)} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={delivDateTo}   onChange={e => setDelivDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{t("invoiceDateHeader", lang)}</span>
          <Input type="date" value={invDateFrom}   onChange={e => setInvDateFrom(e.target.value)}   className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={invDateTo}     onChange={e => setInvDateTo(e.target.value)}     className="h-8 text-xs w-36" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("dueDateHeader", lang)}</span>
          <Input type="date" value={dueDateFrom} onChange={e => setDueDateFrom(e.target.value)} className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={dueDateTo}   onChange={e => setDueDateTo(e.target.value)}   className="h-8 text-xs w-36" />
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">{t("total", lang)}</span>
          <Input placeholder="Min" value={totalMin} onChange={e => setTotalMin(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input placeholder="Max" value={totalMax} onChange={e => setTotalMax(e.target.value)} className="h-8 text-xs w-24" type="number" min="0" />
          {hasFilters && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              {t("clearFilters", lang)}
            </Button>
          )}
        </div>
        {hasFilters && (
          <p className="text-xs text-muted-foreground">{sorted.length} {t("ofLabel", lang)} {list.length} {t("records", lang)}</p>
        )}
      </div>

      {/* ── Main table ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            {t("approvedRecords", lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <ColHeader label={t("orderNumCol", lang)}      col="orderNumber"  sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHeader label={t("customer", lang)}         col="customer"     sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHeader label={t("deliveryHeader", lang)}   col="deliveryDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">{t("itemsLabel", lang)}</th>
                  <ColHeader label={t("total", lang)}            col="total"        sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHeader label={t("invoiceDateHeader", lang)} col="invoiceDate" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <ColHeader label={t("dueDateHeader", lang)}    col="dueDate"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{t("termsHeader", lang)}</th>
                  <ColHeader label={t("payment", lang)}          col="payment"      sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{t("paidAtHeader", lang)}</th>
                  <ColHeader label={t("approvedByHeader", lang)} col="approvedBy"   sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{t("docsHeader", lang)}</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{t("actionsHeader", lang)}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-muted-foreground">{t("loading", lang)}</td>
                  </tr>
                )}
                {!isLoading && sorted.length === 0 && (
                  <tr>
                    <td colSpan={13} className="px-4 py-12 text-center text-muted-foreground">
                      {hasFilters ? t("noRecordsMatchFilters", lang) : t("noRecordsReadyForInvoicing", lang)}
                    </td>
                  </tr>
                )}
                {!isLoading && sorted.map(r => {
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
                          ? r.paymentTermsDays === 0 ? t("cashTerm", lang) : `Net ${r.paymentTermsDays}d`
                          : r.customerPaymentTerms
                            ? paymentTermsDisplayLabel(r.customerPaymentTerms, lang)
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
                            {r.documents.length} {r.documents.length === 1 ? t("fileSingular", lang) : t("filePlural", lang)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t("none", lang)}</span>
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
                            {t("markPaidBtn", lang)}
                          </Button>
                        ) : (
                          <span className="text-xs text-green-700 font-medium">✓ {t("paid", lang)}</span>
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
