import { useParams, Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  useUpdateOrder,
  useAddOrderItem,
  useDeleteOrderItem,
  useSendOrderToPlanning,
  useListProducts,
  useListCustomerAddresses,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  ArrowLeft,
  Trash2,
  Send,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Lock,
  CreditCard,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { formatDate, formatCurrency } from "@/lib/utils";

const PRE_APPROVAL_STATUSES = ["new", "incomplete", "blocked", "planned", "out_for_delivery"];
const SEND_TO_PLANNING_STATUSES = ["new", "incomplete", "blocked"];

const STATUS_COLORS: Record<string, string> = {
  incomplete: "bg-amber-100 text-amber-800 border-amber-200",
  blocked: "bg-red-100 text-red-800 border-red-200",
  new: "bg-blue-100 text-blue-800 border-blue-200",
  planned: "bg-purple-100 text-purple-800 border-purple-200",
  out_for_delivery: "bg-indigo-100 text-indigo-800 border-indigo-200",
  awaiting_accounting_approval: "bg-orange-100 text-orange-800 border-orange-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function OrderDetailPage() {
  const { id } = useParams();
  const orderId = Number(id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const { data: order, isLoading, refetch } = useGetOrder(orderId, {
    query: { enabled: !!orderId } as any,
  });
  const { data: products } = useListProducts();
  const o = order as any;
  const customerId = o?.customer?.id;
  const { data: addresses } = useListCustomerAddresses(customerId ?? 0, {
    query: { enabled: !!customerId } as any,
  });

  const updateOrder = useUpdateOrder();
  const addItem = useAddOrderItem();
  const deleteItem = useDeleteOrderItem();
  const sendToPlanning = useSendOrderToPlanning();

  // Add-item form
  const [productId, setProductId]   = useState("");
  const [quantity,  setQuantity]    = useState("1");

  // Editable order fields form
  const [formUrgency,       setFormUrgency]       = useState("");
  const [formNotes,         setFormNotes]         = useState("");
  const [formChannel,       setFormChannel]       = useState("");
  const [formDeliveryDate,  setFormDeliveryDate]  = useState("");
  const [formPaymentTerms,  setFormPaymentTerms]  = useState("");

  // Populate form when order loads (or ID changes)
  useEffect(() => {
    if (!o) return;
    setFormUrgency(o.urgency ?? "normal");
    setFormNotes(o.notes ?? "");
    setFormChannel(o.businessChannel ?? "");
    setFormDeliveryDate(o.requestedDeliveryDate ?? "");
    setFormPaymentTerms(o.paymentTermsDays != null ? String(o.paymentTermsDays) : "");
  }, [o?.id]);

  const refresh = async () => {
    await refetch();
    qc.invalidateQueries({ queryKey: getListOrdersQueryKey() });
  };

  if (isLoading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!o) return <div className="p-6 text-muted-foreground">Order not found</div>;

  const items        = (o.items ?? []) as any[];
  const customer     = o.customer as any | null;
  const addressList  = (addresses ?? []) as any[];
  const productList  = (products ?? []) as any[];
  const selectedProduct = productList.find((p) => String(p.id) === productId);

  const hasDeliveryAddress = addressList.some((a) => a.isDeliveryAddress);
  const isEditable  = PRE_APPROVAL_STATUSES.includes(o.status);
  const isLocked    = ["awaiting_accounting_approval", "approved"].includes(o.status) && o.status !== "cancelled";
  const isIncomplete = o.status === "incomplete";
  const missingItems   = items.length === 0;
  const missingDate    = !o.requestedDeliveryDate;
  const missingAddress = !hasDeliveryAddress;
  const cannotSend  = isIncomplete || missingItems || missingDate || missingAddress || o.status === "blocked";
  const showSendBtn = SEND_TO_PLANNING_STATUSES.includes(o.status);

  const onAddItem = async () => {
    if (!productId || !selectedProduct) return;
    const qty = Number(quantity);
    if (!qty || qty < 1) return;
    try {
      await addItem.mutateAsync({
        id: orderId,
        data: {
          productId: Number(productId),
          quantity: qty,
          unitPriceSnapshot: Number(selectedProduct.unitPrice ?? 0),
        },
      });
      setProductId("");
      setQuantity("1");
      toast({ title: "Item added" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not add item", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onDeleteItem = async (itemId: number) => {
    try {
      await deleteItem.mutateAsync({ id: orderId, itemId });
      toast({ title: "Item removed" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not remove item", description: e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onSaveOrder = async () => {
    const diff: Record<string, any> = {};
    if (formUrgency !== (o.urgency ?? "normal")) diff.urgency = formUrgency;
    if (formNotes !== (o.notes ?? "")) diff.notes = formNotes;
    if (formChannel !== (o.businessChannel ?? "")) diff.businessChannel = formChannel;
    if (formDeliveryDate !== (o.requestedDeliveryDate ?? "")) diff.requestedDeliveryDate = formDeliveryDate || null;
    const newPT = formPaymentTerms.trim() ? Number(formPaymentTerms) : null;
    const oldPT = o.paymentTermsDays != null ? Number(o.paymentTermsDays) : null;
    if (newPT !== oldPT) diff.paymentTermsDays = newPT;

    if (Object.keys(diff).length === 0) {
      toast({ title: "No changes to save" });
      return;
    }
    try {
      await updateOrder.mutateAsync({ id: orderId, data: diff as any });
      toast({ title: "Order updated" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not save changes", description: e?.error ?? e?.message ?? "Error", variant: "destructive" });
    }
  };

  const onSendToPlanning = async () => {
    try {
      await sendToPlanning.mutateAsync({ id: orderId });
      toast({ title: "Sent to planning", description: "Delivery has been created" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Could not send", description: e?.message ?? "Order is still incomplete", variant: "destructive" });
    }
  };

  const payStatusBadge = () => {
    if (o.paymentStatus === "paid") return <Badge className="bg-green-100 text-green-800 border-green-200 text-xs" variant="outline">Paid</Badge>;
    if (o.paymentStatus === "overdue") return <Badge className="bg-red-100 text-red-800 border-red-200 text-xs" variant="outline">Overdue</Badge>;
    if (o.paymentStatus === "unpaid") return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs" variant="outline">Unpaid</Badge>;
    if (o.invoiceDate) return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs" variant="outline">Unpaid</Badge>;
    return null;
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/orders")} data-testid="link-back-orders">
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          Orders
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-order-number">{o.orderNumber ?? `Order #${o.id}`}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_COLORS[o.status] ?? STATUS_COLORS.new}`}>
              {o.status.replace(/_/g, " ")}
            </span>
            {payStatusBadge()}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {customer ? (
              <Link href={`/customers/${customer.id}`} className="text-primary hover:underline" data-testid="link-customer">
                {customer.companyName}
              </Link>
            ) : "Unknown customer"}
            {" · "}
            {o.businessChannel ?? "—"} · {o.orderSource} · urgency {o.urgency}
          </p>
        </div>
        {showSendBtn && (
          <Button
            onClick={onSendToPlanning}
            disabled={sendToPlanning.isPending || cannotSend}
            data-testid="button-send-to-planning"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {sendToPlanning.isPending ? "Sending..." : "Send to planning"}
          </Button>
        )}
      </div>

      {/* Locked notice */}
      {isLocked && (
        <Card className="border-orange-300 bg-orange-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-orange-900">Order locked for editing</p>
                <p className="text-sm text-orange-800 mt-1">
                  This order has entered the Accounting Approval workflow and can no longer be modified. Only cancellation is allowed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Incomplete checklist */}
      {isIncomplete && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="font-medium text-amber-900">This order is incomplete</p>
                <p className="text-sm text-amber-800">Resolve the items below before sending to planning:</p>
                <ul className="text-sm text-amber-800 space-y-1 mt-1">
                  <li className="flex items-center gap-2">
                    {missingItems ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    At least one order item
                  </li>
                  <li className="flex items-center gap-2">
                    {missingDate ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    Requested delivery date
                  </li>
                  <li className="flex items-center gap-2">
                    {missingAddress ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                    Customer must have a delivery address
                  </li>
                </ul>
                {missingAddress && customer && (
                  <p className="text-sm text-amber-800 pt-1">
                    <Link href={`/customers/${customer.id}`} className="underline font-medium" data-testid="link-fix-address">
                      Open customer to add a delivery address →
                    </Link>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Items card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm">Items</CardTitle>
            <span className="text-sm font-medium" data-testid="text-total">
              Total: {formatCurrency(o.totalAmount)}
            </span>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No items yet. Add the first one below.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border bg-card"
                    data-testid={`row-item-${item.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.quantity} × {formatCurrency(item.unitPriceSnapshot)}
                      </p>
                    </div>
                    <p className="text-sm font-medium">{formatCurrency(item.lineTotal)}</p>
                    {isEditable && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteItem(item.id)}
                        disabled={deleteItem.isPending}
                        aria-label={`Remove ${item.productName}`}
                        data-testid={`button-delete-item-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditable && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase">Add Item</p>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger data-testid="select-product">
                      <SelectValue placeholder="Choose product" />
                    </SelectTrigger>
                    <SelectContent>
                      {productList.map((p: any) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.productName} — {formatCurrency(p.unitPrice)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="Qty"
                    data-testid="input-quantity"
                  />
                  <Button
                    onClick={onAddItem}
                    disabled={addItem.isPending || !productId}
                    data-testid="button-add-item"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right column */}
        <div className="space-y-5">

          {/* Edit Order form — only shown when pre-approval */}
          {isEditable && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Edit Order</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Requested Delivery Date</Label>
                  <Input
                    type="date"
                    value={formDeliveryDate}
                    onChange={e => setFormDeliveryDate(e.target.value)}
                    data-testid="input-delivery-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Urgency</Label>
                  <Select value={formUrgency} onValueChange={setFormUrgency}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-urgency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="critical">Critical</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Channel / Source</Label>
                  <Select value={formChannel} onValueChange={setFormChannel}>
                    <SelectTrigger className="h-8 text-xs" data-testid="select-channel">
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="wholesale">Wholesale</SelectItem>
                      <SelectItem value="retail">Retail</SelectItem>
                      <SelectItem value="horeca">HoReCa</SelectItem>
                      <SelectItem value="subscription">Subscription</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Payment Terms Override (days)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 30 (leave blank to use customer default)"
                    value={formPaymentTerms}
                    onChange={e => setFormPaymentTerms(e.target.value)}
                    data-testid="input-payment-terms"
                    className="h-8 text-xs"
                  />
                  <p className="text-xs text-muted-foreground">Customer default: {o.customer?.paymentTerms ?? "—"}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Notes</Label>
                  <Textarea
                    value={formNotes}
                    onChange={e => setFormNotes(e.target.value)}
                    placeholder="Internal notes..."
                    rows={3}
                    className="text-xs resize-none"
                    data-testid="textarea-notes"
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={onSaveOrder}
                  disabled={updateOrder.isPending}
                  data-testid="button-save-order"
                >
                  {updateOrder.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Order details (read-only when locked) */}
          {!isEditable && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">Order Details</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Requested Delivery Date</Label>
                  <p className="text-sm font-medium" data-testid="text-delivery-date">
                    {o.requestedDeliveryDate ? formatDate(o.requestedDeliveryDate) : "Not set"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Urgency</Label>
                  <p className="text-sm font-medium capitalize">{o.urgency}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Channel</Label>
                  <p className="text-sm font-medium capitalize">{o.businessChannel ?? "—"}</p>
                </div>
                {o.notes && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Notes</Label>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">{o.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Delivery address */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-sm">Delivery Address</CardTitle></CardHeader>
            <CardContent>
              {hasDeliveryAddress ? (
                <p className="text-sm" data-testid="text-delivery-address">
                  {addressList.filter((a) => a.isDeliveryAddress).map((a: any) => `${a.street}, ${a.postalCode} ${a.city}`).join(" · ")}
                </p>
              ) : (
                <p className="text-sm text-amber-700">
                  No delivery address.{" "}
                  {customer && (
                    <Link href={`/customers/${customer.id}`} className="underline">
                      Add one →
                    </Link>
                  )}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Payment info (only if invoiced) */}
          {o.invoiceDate && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Invoice date</span>
                  <span className="font-medium">{formatDate(o.invoiceDate)}</span>
                </div>
                {o.dueDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Due date</span>
                    <span className="font-medium">{formatDate(o.dueDate)}</span>
                  </div>
                )}
                {o.paymentTermsDays != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment terms</span>
                    <span className="font-medium">{o.paymentTermsDays} days</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t">
                  <span className="text-muted-foreground">Status</span>
                  {payStatusBadge()}
                </div>
                {o.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paid at</span>
                    <span className="font-medium">{formatDate(o.paidAt)}</span>
                  </div>
                )}
                {o.collectedAmount != null && Number(o.collectedAmount) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Collected</span>
                    <span className="font-medium">{formatCurrency(o.collectedAmount)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
