import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListCustomers,
  useCheckCustomerDuplicates,
  useCreateCustomer,
  getListCustomersQueryKey,
} from "@workspace/api-client-react";
import { PriorityBadge } from "@/components/priority-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Search, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  SEGMENT_OPTIONS,
  PAYMENT_TERMS_OPTIONS,
  CHANNEL_OPTIONS,
  type PriorityClass,
} from "@/lib/customer-options";
import { useChannel } from "@/lib/channel-context";
import { useLang } from "@/lib/lang-context";
import { t } from "@/lib/i18n";

type CreateForm = {
  contactPerson: string;
  channel: string;
  segment: string;
  priorityClass: PriorityClass;
  paymentTerms: string;
  discountLevel: string;
  notes: string;
};

const EMPTY_CREATE_FORM: CreateForm = {
  contactPerson: "",
  channel: "horeca",
  segment: "cafe",
  priorityClass: "C",
  paymentTerms: "net_30",
  discountLevel: "",
  notes: "",
};

export default function CustomersPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [dupeOpen, setDupeOpen] = useState(false);
  const [dupeForm, setDupeForm] = useState({ companyName: "", phone: "", email: "" });
  const [dupeMatches, setDupeMatches] = useState<any[]>([]);
  const [dupeChecked, setDupeChecked] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE_FORM);

  const { channel } = useChannel();
  const { lang } = useLang();

  const params: Record<string, string> = {};
  if (search) params.search = search;
  if (priority !== "all") params.priority = priority;
  if (activeFilter !== "all") params.active = activeFilter;

  const { data: customers, isLoading } = useListCustomers(params as any);

  const displayCustomers = useMemo(() => {
    const list = (customers ?? []) as any[];
    if (channel === "all") return list;
    if (channel === "cosmetics") return list.filter((c: any) => c.businessChannel === "cosmetics");
    return list.filter((c: any) => c.businessChannel !== "cosmetics");
  }, [customers, channel]);

  const checkDupes = useCheckCustomerDuplicates({
    mutation: {
      onSuccess: (res: any) => {
        setDupeMatches(res?.matches ?? []);
        setDupeChecked(true);
      },
    },
  });

  const createCustomer = useCreateCustomer({
    mutation: {
      onSuccess: (created: any) => {
        toast({ title: "Customer created", description: created?.companyName });
        queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
        setDupeOpen(false);
        if (created?.id) navigate(`/customers/${created.id}`);
      },
      onError: (e: any) =>
        toast({ title: "Failed to create customer", description: e?.error ?? "", variant: "destructive" }),
    },
  });

  const openCreateDialog = () => {
    setDupeOpen(true);
    setDupeChecked(false);
    setDupeMatches([]);
    setDupeForm({ companyName: "", phone: "", email: "" });
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const runDupeCheck = () => {
    setDupeChecked(false);
    checkDupes.mutate({ data: dupeForm });
  };

  const canCreate =
    dupeForm.companyName.trim().length >= 2 &&
    dupeForm.phone.trim().length >= 4 &&
    dupeForm.email.trim().length >= 3 &&
    createForm.contactPerson.trim().length >= 2;

  const submitCreate = () => {
    if (!canCreate) return;
    const discount =
      createForm.discountLevel.trim() === ""
        ? null
        : Number(createForm.discountLevel);
    if (discount !== null && Number.isNaN(discount)) {
      toast({ title: "Discount must be a number", variant: "destructive" });
      return;
    }
    createCustomer.mutate({
      data: {
        companyName: dupeForm.companyName.trim(),
        contactPerson: createForm.contactPerson.trim(),
        phone: dupeForm.phone.trim(),
        email: dupeForm.email.trim(),
        customerChannel: createForm.channel,
        businessChannel: createForm.channel,
        segment: createForm.segment,
        priorityClass: createForm.priorityClass,
        paymentTerms: createForm.paymentTerms,
        discountLevel: discount,
        notes: createForm.notes.trim() || null,
      } as any,
    });
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("customers", lang)}</h1>
          <p className="text-muted-foreground text-sm">
            {displayCustomers.length}{channel !== "all" ? ` of ${customers?.length ?? 0}` : ""} records
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Customer
        </Button>
      </div>

      <Dialog open={dupeOpen} onOpenChange={setDupeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
            <DialogDescription>
              {dupeChecked
                ? "Fill in the remaining details and create the customer."
                : "Enter the basics and we'll check for possible duplicates first."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Company name *</Label>
              <Input
                value={dupeForm.companyName}
                onChange={e => setDupeForm({ ...dupeForm, companyName: e.target.value })}
                placeholder="e.g. Bean & Brew"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Phone *</Label>
                <Input
                  value={dupeForm.phone}
                  onChange={e => setDupeForm({ ...dupeForm, phone: e.target.value })}
                  placeholder="+47 22 ..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  value={dupeForm.email}
                  onChange={e => setDupeForm({ ...dupeForm, email: e.target.value })}
                  placeholder="contact@..."
                />
              </div>
            </div>

            {dupeChecked && dupeMatches.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4" />
                  {dupeMatches.length} possible duplicate{dupeMatches.length === 1 ? "" : "s"} found
                </div>
                <div className="space-y-1">
                  {dupeMatches.slice(0, 5).map(m => (
                    <Link key={m.id} href={`/customers/${m.id}`}>
                      <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-amber-100 cursor-pointer">
                        <PriorityBadge priority={m.priorityClass} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.companyName}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.contactPerson} · {m.phone} · {m.email}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                <p className="text-xs text-amber-800">
                  Review existing records before creating a new one.
                </p>
              </div>
            )}
            {dupeChecked && dupeMatches.length === 0 && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                No similar customers found. Safe to create.
              </div>
            )}

            {dupeChecked && (
              <div className="border-t pt-4 space-y-3">
                <div className="space-y-1.5">
                  <Label>Contact person *</Label>
                  <Input
                    value={createForm.contactPerson}
                    onChange={e => setCreateForm(p => ({ ...p, contactPerson: e.target.value }))}
                    placeholder="Full name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Channel</Label>
                    <Select value={createForm.channel} onValueChange={v => setCreateForm(p => ({ ...p, channel: v }))}>
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
                    <Select value={createForm.segment} onValueChange={v => setCreateForm(p => ({ ...p, segment: v }))}>
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
                      value={createForm.priorityClass}
                      onValueChange={v => setCreateForm(p => ({ ...p, priorityClass: v as PriorityClass }))}
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
                    <Select value={createForm.paymentTerms} onValueChange={v => setCreateForm(p => ({ ...p, paymentTerms: v }))}>
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
                    value={createForm.discountLevel}
                    onChange={e => setCreateForm(p => ({ ...p, discountLevel: e.target.value }))}
                    placeholder="e.g. 10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <textarea
                    className="w-full border rounded-md px-3 py-2 text-sm resize-none h-20 bg-background"
                    value={createForm.notes}
                    onChange={e => setCreateForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="Anything sales should know..."
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDupeOpen(false)}>Cancel</Button>
            {!dupeChecked && (
              <Button
                onClick={runDupeCheck}
                disabled={
                  checkDupes.isPending ||
                  (!dupeForm.companyName.trim() && !dupeForm.phone.trim() && !dupeForm.email.trim())
                }
              >
                {checkDupes.isPending ? "Checking..." : "Check for duplicates"}
              </Button>
            )}
            {dupeChecked && (
              <Button
                onClick={submitCreate}
                disabled={!canCreate || createCustomer.isPending}
              >
                {createCustomer.isPending ? "Creating..." : "Create customer"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="A">Priority A</SelectItem>
            <SelectItem value="B">Priority B</SelectItem>
            <SelectItem value="C">Priority C</SelectItem>
          </SelectContent>
        </Select>
        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Company</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Segment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Payment</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">Loading...</td></tr>
              )}
              {!isLoading && displayCustomers.map((c: any) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <PriorityBadge priority={c.priorityClass} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`}>
                      <span className="text-sm font-medium text-primary hover:underline cursor-pointer">{c.companyName}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm">{c.contactPerson}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize">{c.customerChannel}</td>
                  <td className="px-4 py-3 text-sm capitalize">{c.segment.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-sm">{c.paymentTerms}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
                      {c.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && displayCustomers.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-sm">No customers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
