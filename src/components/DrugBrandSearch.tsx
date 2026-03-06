import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Search, Check, ChevronsUpDown, Pill } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import type { Tables } from "@/integrations/supabase/types";

type Product = Tables<"products">;

interface DrugGroup {
  genericName: string;
  products: Product[];
}

interface DrugBrandSearchProps {
  products: Product[] | undefined;
  selectedProductId: string;
  onSelect: (productId: string) => void;
  /** Show price info (sale price / MRP) */
  showPrice?: boolean;
  /** Price type: "sale" shows sale_price/mrp, "purchase" shows purchase_price */
  priceType?: "sale" | "purchase";
  placeholder?: string;
}

export function DrugBrandSearch({
  products,
  selectedProductId,
  onSelect,
  showPrice = true,
  priceType = "sale",
  placeholder = "Search by drug or brand name...",
}: DrugBrandSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selectedProduct = products?.find((p) => p.id === selectedProductId);

  // Group products by generic_name
  const { drugGroups, ungroupedProducts, allFiltered } = useMemo(() => {
    if (!products) return { drugGroups: [], ungroupedProducts: [], allFiltered: [] };

    const q = query.toLowerCase().trim();

    // Filter products matching query
    const filtered = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.generic_name?.toLowerCase().includes(q) ||
            p.manufacturer?.toLowerCase().includes(q) ||
            p.composition?.toLowerCase().includes(q)
        )
      : products;

    // Group by generic_name
    const grouped = new Map<string, Product[]>();
    const ungrouped: Product[] = [];

    filtered.forEach((p) => {
      const gn = p.generic_name?.trim();
      if (gn) {
        if (!grouped.has(gn.toLowerCase())) {
          grouped.set(gn.toLowerCase(), []);
        }
        grouped.get(gn.toLowerCase())!.push(p);
      } else {
        ungrouped.push(p);
      }
    });

    const groups: DrugGroup[] = Array.from(grouped.entries())
      .map(([, prods]) => ({
        genericName: prods[0].generic_name!,
        products: prods.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.genericName.localeCompare(b.genericName));

    return { drugGroups: groups, ungroupedProducts: ungrouped, allFiltered: filtered };
  }, [products, query]);

  // Auto-select if search matches a drug with only one brand
  useEffect(() => {
    if (!query.trim()) return;
    const q = query.toLowerCase().trim();

    // Check if query matches a generic name exactly or closely
    const matchingGroup = drugGroups.find(
      (g) => g.genericName.toLowerCase() === q || g.genericName.toLowerCase().startsWith(q)
    );

    if (matchingGroup && matchingGroup.products.length === 1 && allFiltered.length === 1) {
      // Only one brand for this drug — auto-select
      onSelect(matchingGroup.products[0].id);
      setOpen(false);
      setQuery("");
    }
  }, [drugGroups, allFiltered, query]);

  const getDisplayPrice = (product: Product) => {
    if (priceType === "purchase") return Number(product.purchase_price);
    return product.sale_price && Number(product.sale_price) > 0
      ? Number(product.sale_price)
      : Number(product.mrp);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between font-normal"
        >
          {selectedProduct ? (
            <span className="truncate">
              {selectedProduct.name}
              {selectedProduct.strength && ` ${selectedProduct.strength}`}
              {selectedProduct.generic_name && (
                <span className="text-muted-foreground ml-1 text-xs">
                  ({selectedProduct.generic_name})
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={placeholder}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>No product found.</CommandEmpty>

            {/* Drug groups (products with generic_name) */}
            {drugGroups.slice(0, 15).map((group) => (
              <CommandGroup
                key={group.genericName}
                heading={
                  <span className="flex items-center gap-1.5">
                    <Pill className="h-3 w-3" />
                    {group.genericName}
                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                      {group.products.length} brand{group.products.length > 1 ? "s" : ""}
                    </Badge>
                  </span>
                }
              >
                {group.products.map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={(value) => {
                      onSelect(value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          selectedProductId === product.id ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="truncate font-medium">{product.name}</span>
                        {product.strength && (
                          <span className="text-muted-foreground text-xs ml-1">
                            {product.strength}
                          </span>
                        )}
                        <div className="text-xs text-muted-foreground truncate">
                          {product.manufacturer}
                        </div>
                      </div>
                    </div>
                    {showPrice && (
                      <div className="text-right ml-2 shrink-0">
                        <span className="text-sm font-mono">
                          ₹{getDisplayPrice(product)}
                        </span>
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}

            {drugGroups.length > 0 && ungroupedProducts.length > 0 && (
              <CommandSeparator />
            )}

            {/* Ungrouped products (no generic_name) */}
            {ungroupedProducts.length > 0 && (
              <CommandGroup heading="Other Products">
                {ungroupedProducts.slice(0, 20).map((product) => (
                  <CommandItem
                    key={product.id}
                    value={product.id}
                    onSelect={(value) => {
                      onSelect(value);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex items-center justify-between py-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          selectedProductId === product.id ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className="truncate">{product.name}</span>
                        {product.strength && (
                          <span className="text-muted-foreground text-xs ml-1">
                            {product.strength}
                          </span>
                        )}
                      </div>
                    </div>
                    {showPrice && (
                      <div className="text-right ml-2 shrink-0">
                        <span className="text-sm font-mono">
                          ₹{getDisplayPrice(product)}
                        </span>
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
