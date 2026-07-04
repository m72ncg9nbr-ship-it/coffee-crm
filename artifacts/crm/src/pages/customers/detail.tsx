import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useGetCustomer, useUpdateCustomer } from "@workspace/api-client-react";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";
import { PriorityBadge, StatusBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Mail, Phone, MapPin, Building2, Power, Pencil, ChevronDown, ChevronRight, TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";
import { formatDate, formatCurrency } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  SEGMENT_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  CHANNEL_OPTIONS,
  type PriorityClass,
  inferSegment,
  normalisePaymentTerms,
  normaliseChannel,
} from "@/lib/customer-options";

type EditForm = {
  companyName: string;
  contactPerson: string;
  phone: string;
  email: string;
  channel: string;
  segment: string;
  priorityClass: PriorityClass;
  paymentTerms: string;
  discountLevel: string;
  notes: string;
  paymentOrderRuleMode: string;
  overdueThresholdAmount: string;
  gracePeriodDays: string;
  allowAdminGmOverride: boolean;
  paymentOrderRuleNote: string;
};

function fromCustomer(c: any): EditForm {
  return {
    companyName: c.companyName ?? "",
    contactPerson: c.contactPerson ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    channel: normaliseChannel(c.businessChannel ?? c.customerChannel),
    segment: inferSegment(c.segment),
    priorityClass: (c.priorityClass as PriorityClass) ?? "C",
    paymentTerms: normalisePaymentTerms(c.paymentTerms),
    discountLevel: c.discountLevel != null ? String(c.discountLevel) : "",
    notes: c.notes ?? "",
    paymentOrderRuleMode: c.paymentOrderRuleMode ?? "no_block",
    overdueThresholdAmount: c.overdueThresholdAmount != null ? String(c.overdueThresholdAmount) : "",
    gracePeriodDays: c.gracePeriodDays != null ? String(c.gracePeriodDays) : "0",
    allowAdminGmOverride: c.allowAdminGmOverride ?? false,
    paymentOrderRuleNote: c.paymentOrderRuleNote ?? "",
  };
}

function PayBadge({ status, dueDate, paidAt }: { status: string; dueDate?: string | null; paidAt?: string | null }) {
  const today = new Date().toISOString().split("T")[0];
  if (status === "paid") {
    const late = paidAt && dueDate && paidAt.slice(0, 10) > dueDate;
    return <Badge variant="outline" className={late ? "border-yellow-300 bg-yellow-50 text-yellow-800" : "border-green-300 bg-green-50 text-green-800"}>{late ? "Paid Late" : "Paid"}</Badge>;
  }
  if (dueDate && dueDate < today) return <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">Overdue</Badge>;
  if (dueDate) return <Badge variant="outline" className="border-yellow-300 bg-yellow-50 text-yellow-800">Unpaid</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">Not invoiced</Badge>;
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const { lang } = useLang();
  const { data: customer, isLoading, refetch } = useGetCustomer(Number(id), {
    query: { enabled: !!id } as any,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<number>>(new Set());

  const { data: history, isLoading: histLoading } = useQuery({
    queryKey: ["customer-history", id],
    queryFn: () => fetch(`/api/customers/${id}/history`, { credentials: "include" }).then(r => r.json()),
    enabled: !!id,
  });

  function toggleOrder(orderId: number) {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  }

  useEffect(() => {
    if (!editOpen && customer) setEditForm(fromCustomer(customer));
  }, [customer, editOpen]);

  const updateCustomer = useUpdateCustomer({
    mutation: {
      onSuccess: () => {
        refetch();
        setEditOpen(false);
        toast({ title: "Customer updated" });
      },
      onError: (e: any) =>
        toast({ title: "Failed to update customer", description: e?.error ?? "", variant: "destructive" }),
    },
  });

  const submitEdit = () => {
    if (!editForm || !id) return;
    if (
      editForm.companyName.trim().length < 2 ||
      editForm.contactPerson.trim().length < 2 ||
      editForm.phone.trim().length < 4 ||
      editForm.email.trim().length < 3
    ) {
      toast({ title: "Company, contact, phone and email are required", variant: "destructive" });
      return;
    }
    const discount =
      editForm.discountLevel.trim() === "" ? null : Number(editForm.discountLevel);
    if (discount !== null && Number.isNaN(discount)) {
      toast({ title: "Discount must be a number", variant: "destructive" });
      return;
    }
    const graceDays = editForm.gracePeriodDays.trim() === "" ? 0 : Number(editForm.gracePeriodDays);
    const thresholdAmt = editForm.overdueThresholdAmount.trim() === "" ? null : Number(editForm.overdueThresholdAmount);
    updateCustomer.mutate({
      id: Number(id),
      data: {
        companyName: editForm.companyName.trim(),
        contactPerson: editForm.contactPerson.trim(),
        phone: editForm.phone.trim(),
        email: editForm.email.trim(),
        customerChannel: editForm.channel,
        businessChannel: editForm.channel,
        segment: editForm.segment,
        priorityClass: editForm.priorityClass,
        paymentTerms: editForm.paymentTerms,
        discountLevel: discount,
        notes: editForm.notes.trim() || null,
        paymentOrderRuleMode: editForm.paymentOrderRuleMode as any,
        overdueThresholdAmount: thresholdAmt,
        gracePeriodDays: isNaN(graceDays) ? 0 : graceDays,
        allowAdminGmOverride: editForm.allowAdminGmOverride,
        paymentOrderRuleNote: editForm.paymentOrderRuleNote.trim() || null,
      } as any,
    });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!customer) return <div className="p-6 text-muted-foreground">Customer not found</div>;

  const c = customer as any;

  return (
    <div className="p-6 space-y-5 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Customers
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditForm(fromCustomer(c)); setEditOpen(true); }}
            data-testid="button-edit-customer"
          >
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit details
          </Button>
          <Button
            variant={c.active ? "outline" : "default"}
            size="sm"
            onClick={() => updateCustomer.mutate({ id: Number(id), data: { active: !c.active } })}
            disabled={updateCustomer.isPending}
            data-testid="button-toggle-customer-active"
          >
            <Power className="h-4 w-4 mr-1.5" />
            {c.active ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{c.companyName}</h1>
            <PriorityBadge priority={c.priorityClass} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
              {c.active ? "Active" : "Inactive"}
            </span>
          </div>
          <p className="text-muted-foreground text-sm capitalize">{c.segment?.replace(/_/g, " ")} · {c.customerChannel} · {c.businessChannel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Contact</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium w-28 shrink-0">Contact person</span>
              <span className="text-muted-foreground">{c.contactPerson}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{c.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Commercial Terms</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Row label="Payment Terms" value={c.paymentTerms} />
            <Row label="Discount Level" value={c.discountLevel != null ? `${c.discountLevel}%` : "None"} />
            <Row label="Priority Class" value={
              <div className="flex items-center gap-1.5">
                <PriorityBadge priority={c.priorityClass} />
                <span className="text-sm text-muted-foreground">Priority {c.priorityClass}</span>
              </div>
            } />
            <Row label="Customer Since" value={formatDate(c.createdAt)} />
          </CardContent>
        </Card>

        {c.notes && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{c.notes}</p>
            </CardContent>
          </Card>
        )}

        {c.paymentOrderRuleMode && c.paymentOrderRuleMode !== "no_block" && (
          <Card className="md:col-span-2 border-amber-200 bg-amber-50/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                {t("paymentOrderRule", lang)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Row label={t("ruleType", lang)} value={
                <span className="font-medium text-amber-800 capitalize">
                  {c.paymentOrderRuleMode === "warning_only" ? t("ruleWarningOnly", lang)
                    : c.paymentOrderRuleMode === "block_any_overdue" ? t("ruleBlockAnyOverdue", lang)
                    : c.paymentOrderRuleMode === "block_overdue_threshold" ? t("ruleBlockThreshold", lang)
                    : c.paymentOrderRuleMode}
                </span>
              } />
              {c.overdueThresholdAmount != null && (
                <Row label={t("overdueThreshold", lang)} value={`${c.overdueThresholdAmount}`} />
              )}
              {c.gracePeriodDays > 0 && (
                <Row label={t("gracePeriodDays", lang)} value={`${c.gracePeriodDays}`} />
              )}
              <Row label={t("allowAdminGmOverride", lang)} value={c.allowAdminGmOverride ? "Yes" : "No"} />
              {c.paymentOrderRuleNote && (
                <Row label={t("orderPolicyNote", lang)} value={c.paymentOrderRuleNote} />
              )}
            </CardContent>
          </Card>
        )}

        {c.addresses && c.addresses.length > 0 && (
          <Card className="md:col-span-2">
            <CardHeader className="pb-3"><CardTitle className="text-sm">Addresses</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {c.addresses.map((addr: any) => (
                  <div key={addr.id} className="flex gap-3 p-3 rounded-lg border bg-muted/20">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold capitalize">
                          {[addr.isDeliveryAddress && "delivery", addr.isBillingAddress && "billing"].filter(Boolean).join(" / ") || addr.addressType}
                        </span>
                        {addr.label && <span className="text-xs text-muted-foreground">· {addr.label}</span>}
                        {addr.isDefault && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">Default</span>}
                      </div>
                      <p className="text-sm">{addr.street}</p>
                      <p className="text-sm text-muted-foreground">{addr.postalCode} {addr.city}, {addr.country}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Purchase History / Customer 360 ────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Purchase History
        </h2>

        {histLoading && <p className="text-sm text-muted-foreground">Loading history...</p>}

        {history && (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
                  <p className="text-2xl font-bold">{history.summary.totalOrders}</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Revenue</p>
                  <p className="text-2xl font-bold">{formatCurrency(history.summary.totalRevenue)}</p>
                </CardContent>
              </Card>
              <Card className="shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Paid</p>
                  <p className="text-2xl font-bold text-green-700">{formatCurrency(history.summary.totalPaid)}</p>
                </CardContent>
              </Card>
              <Card className={`shadow-sm ${history.summary.overdueAmount > 0 ? "border-red-300" : ""}`}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
                  <p className={`text-2xl font-bold ${history.summary.outstandingAmount > 0 ? "text-amber-700" : "text-green-700"}`}>
                    {formatCurrency(history.summary.outstandingAmount)}
                  </p>
                  {history.summary.overdueAmount > 0 && (
                    <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3 w-3" />
                      {formatCurrency(history.summary.overdueAmount)} overdue
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Payment behaviour */}
            <div className="flex flex-wrap gap-4 text-sm px-1">
              {history.summary.lastOrderDate && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Last order: <span className="text-foreground font-medium">{formatDate(history.summary.lastOrderDate)}</span>
                </span>
              )}
              {history.summary.onTimePayments > 0 && (
                <span className="flex items-center gap-1.5 text-green-700">
                  <CheckCircle className="h-3.5 w-3.5" />
                  {history.summary.onTimePayments} on-time payment{history.summary.onTimePayments !== 1 ? "s" : ""}
                </span>
              )}
              {history.summary.latePayments > 0 && (
                <span className="flex items-center gap-1.5 text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {history.summary.latePayments} late payment{history.summary.latePayments !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {/* Order list */}
            {history.orders.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground text-sm">No orders yet</CardContent></Card>
            ) : (
              <Card>
                <div className="divide-y">
                  {history.orders.map((o: any) => {
                    const expanded = expandedOrders.has(o.id);
                    return (
                      <div key={o.id}>
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                          onClick={() => toggleOrder(o.id)}
                        >
                          <span className="text-muted-foreground shrink-0">
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </span>
                          <span className="font-mono text-sm font-medium w-28 shrink-0">{o.orderNumber}</span>
                          <span className="text-xs text-muted-foreground w-24 shrink-0">{formatDate(o.orderDate)}</span>
                          <StatusBadge status={o.status} />
                          <span className="text-xs text-muted-foreground capitalize px-1.5 py-0.5 rounded bg-muted">{o.businessChannel}</span>
                          <span className="flex-1" />
                          <span className="text-sm font-semibold w-28 text-right shrink-0">{formatCurrency(o.totalAmount)}</span>
                          <span className="w-28 text-right shrink-0">
                            <PayBadge status={o.paymentStatus} dueDate={o.dueDate} paidAt={o.paidAt} />
                          </span>
                        </button>
                        {expanded && o.items.length > 0 && (
                          <div className="bg-muted/20 border-t px-4 py-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left pb-1.5 font-medium">Product</th>
                                  <th className="text-right pb-1.5 font-medium w-16">Qty</th>
                                  <th className="text-right pb-1.5 font-medium w-24">Unit Price</th>
                                  <th className="text-right pb-1.5 font-medium w-24">Line Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/50">
                                {o.items.map((item: any, idx: number) => (
                                  <tr key={idx}>
                                    <td className="py-1">{item.productName}</td>
                                    <td className="text-right py-1">{item.quantity}</td>
                                    <td className="text-right py-1">{formatCurrency(item.unitPrice)}</td>
                                    <td className="text-right py-1 font-medium">{formatCurrency(item.lineTotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {o.dueDate && (
                              <div className="mt-2 text-xs text-muted-foreground flex gap-4">
                                {o.invoiceDate && <span>Invoice: {formatDate(o.invoiceDate)}</span>}
                                <span>Due: {formatDate(o.dueDate)}</span>
                                {o.paidAt && <span>Paid: {formatDate(o.paidAt)}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update contact, channel, priority, terms or notes. Changes save immediately.
            </DialogDescription>
          </DialogHeader>
          {editForm && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Company name *</Label>
                <Input
                  value={editForm.companyName}
                  onChange={e => setEditForm(p => p && { ...p, companyName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Contact person *</Label>
                  <Input
                    value={editForm.contactPerson}
                    onChange={e => setEditForm(p => p && { ...p, contactPerson: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Phone *</Label>
                  <Input
                    value={editForm.phone}
                    onChange={e => setEditForm(p => p && { ...p, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  value={editForm.email}
                  onChange={e => setEditForm(p => p && { ...p, email: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Channel</Label>
                  <Select value={editForm.channel} onValueChange={v => setEditForm(p => p && { ...p, channel: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CHANNEL_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Segment</Label>
                  <Select value={editForm.segment} onValueChange={v => setEditForm(p => p && { ...p, segment: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SEGMENT_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Priority class *</Label>
                  <Select
                    value={editForm.priorityClass}
                    onValueChange={v => setEditForm(p => p && { ...p, priorityClass: v as PriorityClass })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A">A — top priority</SelectItem>
                      <SelectItem value="B">B — standard</SelectItem>
                      <SelectItem value="C">C — low priority</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Payment terms</Label>
                  <Select value={editForm.paymentTerms} onValueChange={v => setEditForm(p => p && { ...p, paymentTerms: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAYMENT_TERMS_OPTIONS.map(o => (
                        <SelectItem key={o} value={o} className="capitalize">{o.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Discount % (optional)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={editForm.discountLevel}
                  onChange={e => setEditForm(p => p && { ...p, discountLevel: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes (optional)</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                  value={editForm.notes}
                  onChange={e => setEditForm(p => p && { ...p, notes: e.target.value })}
                />
              </div>

              <div className="border-t pt-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("paymentOrderRule", lang)}</p>
                <div className="space-y-1.5">
                  <Label>{t("ruleType", lang)}</Label>
                  <Select
                    value={editForm.paymentOrderRuleMode}
                    onValueChange={v => setEditForm(p => p && { ...p, paymentOrderRuleMode: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_block">{t("ruleNoBlock", lang)}</SelectItem>
                      <SelectItem value="warning_only">{t("ruleWarningOnly", lang)}</SelectItem>
                      <SelectItem value="block_any_overdue">{t("ruleBlockAnyOverdue", lang)}</SelectItem>
                      <SelectItem value="block_overdue_threshold">{t("ruleBlockThreshold", lang)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editForm.paymentOrderRuleMode === "block_overdue_threshold" && (
                  <div className="space-y-1.5">
                    <Label>{t("overdueThreshold", lang)}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 5000"
                      value={editForm.overdueThresholdAmount}
                      onChange={e => setEditForm(p => p && { ...p, overdueThresholdAmount: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t("gracePeriodDays", lang)}</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={editForm.gracePeriodDays}
                      onChange={e => setEditForm(p => p && { ...p, gracePeriodDays: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 flex flex-col justify-end">
                    <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
                      <input
                        type="checkbox"
                        checked={editForm.allowAdminGmOverride}
                        onChange={e => setEditForm(p => p && { ...p, allowAdminGmOverride: e.target.checked })}
                        className="h-4 w-4 rounded border"
                      />
                      <span className="text-sm">{t("allowAdminGmOverride", lang)}</span>
                    </label>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{t("orderPolicyNote", lang)}</Label>
                  <Input
                    placeholder="Internal note about this rule"
                    value={editForm.paymentOrderRuleNote}
                    onChange={e => setEditForm(p => p && { ...p, paymentOrderRuleNote: e.target.value })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={submitEdit}
              disabled={updateCustomer.isPending}
              data-testid="button-save-customer"
            >
              {updateCustomer.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium w-32 shrink-0">{label}</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}
