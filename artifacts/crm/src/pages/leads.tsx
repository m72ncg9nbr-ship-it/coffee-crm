import { useState } from "react";
import { useListLeads, useCreateLead } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/priority-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/utils";
import { Plus, X, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function LeadsPage() {
  const { data: leads, isLoading, refetch } = useListLeads();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    companyName: "", contactPerson: "", phone: "", email: "",
    businessChannel: "horeca", businessType: "", estimatedMonthlyConsumption: "",
    preferredCoffeeType: "", requestedPaymentTerms: "net_30", extraNotes: ""
  });

  const createLead = useCreateLead({
    mutation: {
      onSuccess: () => {
        refetch();
        setShowForm(false);
        setForm({ companyName: "", contactPerson: "", phone: "", email: "", businessChannel: "horeca", businessType: "", estimatedMonthlyConsumption: "", preferredCoffeeType: "", requestedPaymentTerms: "net_30", extraNotes: "" });
        toast({ title: "Lead submitted successfully" });
      },
      onError: () => toast({ title: "Failed to submit lead", variant: "destructive" })
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLead.mutate({ data: { ...form, estimatedMonthlyConsumption: form.estimatedMonthlyConsumption || undefined } as any });
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leads</h1>
          <p className="text-muted-foreground text-sm">{leads?.length ?? 0} lead intake records</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4 mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
          {showForm ? "Cancel" : "New Lead"}
        </Button>
      </div>

      {showForm && (
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              New Lead Intake
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input required value={form.companyName} onChange={e => setForm(p => ({ ...p, companyName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person *</Label>
                <Input required value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Business Channel</Label>
                <Select value={form.businessChannel} onValueChange={v => setForm(p => ({ ...p, businessChannel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horeca">HoReCa</SelectItem>
                    <SelectItem value="office">Office</SelectItem>
                    <SelectItem value="retail">Retail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Business Type</Label>
                <Input placeholder="e.g. bar, hotel, coworking..." value={form.businessType} onChange={e => setForm(p => ({ ...p, businessType: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Consumption (kg)</Label>
                <Input type="number" value={form.estimatedMonthlyConsumption} onChange={e => setForm(p => ({ ...p, estimatedMonthlyConsumption: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Select value={form.requestedPaymentTerms} onValueChange={v => setForm(p => ({ ...p, requestedPaymentTerms: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="net_14">Net 14</SelectItem>
                    <SelectItem value="net_30">Net 30</SelectItem>
                    <SelectItem value="net_60">Net 60</SelectItem>
                    <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <textarea
                  className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                  value={form.extraNotes}
                  onChange={e => setForm(p => ({ ...p, extraNotes: e.target.value }))}
                  placeholder="Additional information..."
                />
              </div>
              <div className="col-span-2 flex justify-end">
                <Button type="submit" disabled={createLead.isPending}>
                  {createLead.isPending ? "Submitting..." : "Submit Lead"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {isLoading && <div className="text-muted-foreground text-sm py-8 text-center">Loading...</div>}
        {!isLoading && (leads ?? []).map((lead: any) => (
          <Card key={lead.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{lead.companyName}</span>
                    <StatusBadge status={lead.status} />
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">{lead.businessChannel}</span>
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground flex-wrap">
                    <span>{lead.contactPerson}</span>
                    {lead.phone && <span>{lead.phone}</span>}
                    {lead.email && <span>{lead.email}</span>}
                    {lead.businessType && <span className="capitalize">{lead.businessType}</span>}
                    {lead.estimatedMonthlyConsumption && <span>{lead.estimatedMonthlyConsumption} kg/mo est.</span>}
                  </div>
                  {lead.extraNotes && <p className="text-xs text-muted-foreground italic">"{lead.extraNotes}"</p>}
                </div>
                <p className="text-xs text-muted-foreground shrink-0">{formatDateTime(lead.createdAt)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
        {!isLoading && (leads ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <UserPlus className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No leads yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
