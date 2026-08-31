import { useListAccountingApprovals, useApproveDelivery, useRejectDelivery } from "@workspace/api-client-react";
import { useMutation } from "@tanstack/react-query";
import { StatusBadge } from "@/components/priority-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate, formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, FileText, CreditCard, SlidersHorizontal, X } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { deviationTypeDisplayLabel } from "@/lib/customer-options";

export default function AccountingPage() {
  const { data: approvals, isLoading, refetch } = useListAccountingApprovals();
  const { toast } = useToast();
  const { user } = useAuth();
  const { channel } = useChannel();
  const { lang } = useLang();
  const [notes, setNotes] = useState<Record<number, string>>({});

  // ── Filter state ────────────────────────────────────────────────────────────
  const [statusFilter,  setStatusFilter]  = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");

  const approveDelivery = useApproveDelivery({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: t("deliveryApproved", lang) }); },
      onError: () => toast({ title: t("failedToApprove", lang), variant: "destructive" })
    }
  });

  const rejectDelivery = useRejectDelivery({
    mutation: {
      onSuccess: () => { refetch(); toast({ title: t("deliveryRejected", lang) }); },
      onError: () => toast({ title: t("failedToReject", lang), variant: "destructive" })
    }
  });

  const markPaid = useMutation({
    mutationFn: (vars: { id: number; data: Record<string, unknown> }) =>
      fetch(`/api/orders/${vars.id}/mark-paid`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars.data),
      }).then(r => r.json()),
    onSuccess: () => { refetch(); toast({ title: t("orderMarkedAsPaid", lang) }); },
    onError: () => toast({ title: t("failedToMarkAsPaid", lang), variant: "destructive" }),
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

  // Only full-access accounting roles can mark paid
  const canMarkPaid = user?.role && ["owner_admin", "general_manager", "accounting"].includes(user.role);

  const isBusy = approveDelivery.isPending || rejectDelivery.isPending || markPaid.isPending;

  // ── Filter pipeline ─────────────────────────────────────────────────────────
  const hasFilters = statusFilter !== "all" || paymentFilter !== "all" || dateFrom || dateTo;

  function clearFilters() {
    setStatusFilter("all"); setPaymentFilter("all"); setDateFrom(""); setDateTo("");
  }

  const filteredApprovals = useMemo(() => {
    let list = (approvals ?? []) as any[];
    // Global channel filter
    if (channel === "cosmetics") list = list.filter(a => a.businessChannel === "cosmetics");
    else if (channel === "coffee") list = list.filter(a => a.businessChannel !== "cosmetics");
    if (statusFilter !== "all") list = list.filter(a => a.status === statusFilter);
    if (paymentFilter !== "all") {
      const today = new Date().toISOString().split("T")[0];
      list = list.filter(a => {
        if (paymentFilter === "paid")    return a.paymentStatus === "paid";
        if (paymentFilter === "overdue") return a.paymentStatus !== "paid" && a.dueDate && a.dueDate < today;
        if (paymentFilter === "unpaid")  return a.paymentStatus !== "paid" && !(a.dueDate && a.dueDate < today);
        return true;
      });
    }
    if (dateFrom) list = list.filter(a => a.scheduledDate && a.scheduledDate >= dateFrom);
    if (dateTo)   list = list.filter(a => a.scheduledDate && a.scheduledDate <= dateTo);
    return list;
  }, [approvals, channel, statusFilter, paymentFilter, dateFrom, dateTo]);

  const pending  = filteredApprovals.filter((a: any) => a.status === "pending");
  const reviewed = filteredApprovals.filter((a: any) => a.status !== "pending");

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("accountingApprovals", lang)}</h1>
        <p className="text-muted-foreground text-sm">{pending.length} {t("pendingApprovalsSubtitle", lang)}</p>
      </div>

      {/* ── Filter bar ──────────────────────────────────────────────────────── */}
      <div className="bg-muted/20 border rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span>{t("filters", lang)}</span>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder={t("allStatuses", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses", lang)}</SelectItem>
              <SelectItem value="pending">{t("pending", lang)}</SelectItem>
              <SelectItem value="approved">{t("approved", lang)}</SelectItem>
              <SelectItem value="rejected">{t("rejected", lang)}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="h-8 text-xs w-40"><SelectValue placeholder={t("allPayments", lang)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allPayments", lang)}</SelectItem>
              <SelectItem value="paid">{t("paid", lang)}</SelectItem>
              <SelectItem value="unpaid">{t("unpaid", lang)}</SelectItem>
              <SelectItem value="overdue">{t("overdue", lang)}</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground whitespace-nowrap">{t("date", lang)}</span>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-8 text-xs w-36" title="Scheduled date from" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={dateTo}   onChange={e => setDateTo(e.target.value)}   className="h-8 text-xs w-36" title="Scheduled date to" />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <X className="h-3.5 w-3.5" />
            {t("clearFilters", lang)}
          </Button>
        </div>
        {hasFilters && (
          <p className="text-xs text-muted-foreground">{filteredApprovals.length} {t("ofLabel", lang)} {(approvals ?? []).length} {t("records", lang)}</p>
        )}
      </div>

      {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">{t("loading", lang)}</div>}

      {!isLoading && (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-amber-700 uppercase tracking-wider">{t("pendingReviewSection", lang)}</h2>
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
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("reviewedSection", lang)}</h2>
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

          {filteredApprovals.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>{hasFilters ? t("noApprovalsMatchFilters", lang) : t("noApprovalRequests", lang)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaymentStatusBadge({ status }: { status?: string }) {
  const { lang } = useLang();
  if (!status) return null;
  const map: Record<string, { labelKey: "paid" | "unpaid" | "overdue"; className: string }> = {
    paid:    { labelKey: "paid",    className: "bg-green-100 text-green-800 border-green-200" },
    unpaid:  { labelKey: "unpaid",  className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    overdue: { labelKey: "overdue", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const cfg = map[status];
  return (
    <Badge variant="outline" className={`text-xs ${cfg?.className ?? "bg-muted text-muted-foreground"}`}>
      {cfg ? t(cfg.labelKey, lang) : status}
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
  const { lang } = useLang();
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
              <span>{t("scheduledLabel", lang)} {formatDate(a.scheduledDate)}</span>
              <span>{t("driverLabel", lang)} {a.driverName ?? "—"}</span>
              {a.status === "approved" && a.invoiceDate && (
                <span>{t("invoiceLabel", lang)} {a.invoiceDate}</span>
              )}
              {a.status === "approved" && a.dueDate && (
                <span className={
                  a.paymentStatus !== "paid" && a.dueDate < new Date().toISOString().split("T")[0]
                    ? "text-red-600 font-medium"
                    : ""
                }>
                  {t("dueLabel", lang)} {a.dueDate}
                </span>
              )}
              {a.hasDocument && a.documentUrl && (
                <a href={a.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-green-700 hover:underline">
                  <FileText className="h-3 w-3" />
                  {t("viewDocument", lang)}
                </a>
              )}
              {a.hasDocument && !a.documentUrl && (
                <span className="flex items-center gap-1 text-green-700">
                  <FileText className="h-3 w-3" />
                  {t("documentUploaded", lang)}
                </span>
              )}
              {!a.hasDocument && (
                <span className="text-amber-700">{t("noDocument", lang)}</span>
              )}
            </div>
            {Array.isArray(a.orderItems) && a.orderItems.length > 0 && (
              <div className="text-xs bg-muted/30 rounded px-2 py-1.5 border">
                <span className="font-medium text-muted-foreground">{t("itemsLabel", lang)} </span>
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
                <span className="font-medium capitalize">{deviationTypeDisplayLabel(a.deviationType ?? "", lang)}: </span>
                {a.deviationNote}
              </div>
            )}
            {readonly && a.reviewNotes && (
              <p className="text-xs text-muted-foreground italic">"{a.reviewNotes}"</p>
            )}
            {readonly && a.reviewedAt && (
              <p className="text-xs text-muted-foreground">{t("reviewedLabel", lang)} {formatDateTime(a.reviewedAt)}{a.reviewedByName ? ` ${t("reviewedBy", lang)} ${a.reviewedByName}` : ""}</p>
            )}
            {readonly && a.status === "approved" && a.paidAt && (
              <p className="text-xs text-green-700">{t("paidLabel", lang)} {formatDateTime(a.paidAt)}</p>
            )}
          </div>
          {!readonly && (
            <div className="flex flex-col gap-2 min-w-52">
              <textarea
                className="w-full text-xs border rounded p-2 resize-none h-16 bg-background"
                placeholder={t("reviewNotesTip", lang)}
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
                  {t("approve", lang)}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1"
                  onClick={onReject}
                  disabled={isPending}
                >
                  <XCircle className="h-3.5 w-3.5 mr-1" />
                  {t("reject", lang)}
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
              {t("markPaidBtn", lang)}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
