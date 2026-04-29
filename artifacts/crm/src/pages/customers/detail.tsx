import { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useGetCustomer, useUpdateCustomer } from "@workspace/api-client-react";
import { PriorityBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ArrowLeft, Mail, Phone, MapPin, Building2, Power, Pencil } from "lucide-react";
import { formatDate } from "@/lib/utils";
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
  };
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const { data: customer, isLoading, refetch } = useGetCustomer(Number(id), {
    query: { enabled: !!id } as any,
  });
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);

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
