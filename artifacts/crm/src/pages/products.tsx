import { useListProducts } from "@workspace/api-client-react";
import { StatusBadge } from "@/components/priority-badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { Package, Search } from "lucide-react";

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const { data: products, isLoading } = useListProducts({ search: search || undefined } as any);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Products</h1>
          <p className="text-muted-foreground text-sm">{products?.length ?? 0} items in catalog</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search products..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && <div className="col-span-3 text-center py-8 text-muted-foreground text-sm">Loading...</div>}
        {!isLoading && (products ?? []).map((p: any) => (
          <Card key={p.id} className="p-4 flex gap-4">
            <div className="h-14 w-14 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0">
              <Package className="h-7 w-7 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold leading-tight">{p.productName}</span>
                <StatusBadge status={p.stockStatus} />
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{p.sku}</p>
              <p className="text-xs text-muted-foreground capitalize mt-0.5">{p.category?.replace(/_/g, " ")} · {p.businessChannel}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm font-bold text-primary">{formatCurrency(p.unitPrice)}</span>
                {p.costPrice != null && (
                  <span className="text-xs text-muted-foreground">
                    Cost: {formatCurrency(p.costPrice)}
                  </span>
                )}
              </div>
            </div>
          </Card>
        ))}
        {!isLoading && (products ?? []).length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p>No products found</p>
          </div>
        )}
      </div>
    </div>
  );
}
