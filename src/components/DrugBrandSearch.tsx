import { useState, useMemo, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from "react";
import { Search, Check, Pill, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  showPrice?: boolean;
  priceType?: "sale" | "purchase";
  placeholder?: string;
}

export interface DrugBrandSearchHandle {
  focus: () => void;
  clear: () => void;
}

export const DrugBrandSearch = forwardRef<DrugBrandSearchHandle, DrugBrandSearchProps>(
  function DrugBrandSearch(
    {
      products,
      selectedProductId,
      onSelect,
      showPrice = true,
      priceType = "sale",
      placeholder = "Search product...",
    },
    ref
  ) {
    const [query, setQuery] = useState("");
    const [open, setOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedProduct = products?.find((p) => p.id === selectedProductId);

    useImperativeHandle(ref, () => ({
      focus: () => {
        inputRef.current?.focus();
      },
      clear: () => {
        setQuery("");
        setOpen(false);
      },
    }));

    // Filter & group products
    const { flatResults } = useMemo(() => {
      if (!products) return { flatResults: [] };
      const q = query.toLowerCase().trim();
      if (!q && selectedProductId) return { flatResults: [] };

      const filtered = q
        ? products.filter(
            (p) =>
              p.name.toLowerCase().includes(q) ||
              p.generic_name?.toLowerCase().includes(q) ||
              p.manufacturer?.toLowerCase().includes(q) ||
              p.composition?.toLowerCase().includes(q)
          )
        : products;

      return { flatResults: filtered.slice(0, 30) };
    }, [products, query, selectedProductId]);

    // Reset highlight on results change
    useEffect(() => {
      setHighlightIndex(0);
    }, [flatResults]);

    // Close dropdown on outside click
    useEffect(() => {
      const handler = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Auto-select single exact match
    useEffect(() => {
      if (!query.trim()) return;
      if (flatResults.length === 1) {
        const p = flatResults[0];
        const q = query.toLowerCase().trim();
        if (p.name.toLowerCase() === q || p.generic_name?.toLowerCase() === q) {
          handleSelect(p.id);
        }
      }
    }, [flatResults, query]);

    const handleSelect = useCallback(
      (productId: string) => {
        onSelect(productId);
        setQuery("");
        setOpen(false);
      },
      [onSelect]
    );

    const getDisplayPrice = (product: Product) => {
      if (priceType === "purchase") return Number(product.purchase_price);
      return product.sale_price && Number(product.sale_price) > 0
        ? Number(product.sale_price)
        : Number(product.mrp);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!open || flatResults.length === 0) {
        if (e.key === "ArrowDown" && flatResults.length > 0) {
          setOpen(true);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setHighlightIndex((prev) => Math.min(prev + 1, flatResults.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setHighlightIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatResults[highlightIndex]) {
            handleSelect(flatResults[highlightIndex].id);
          }
          break;
        case "Escape":
          e.preventDefault();
          setOpen(false);
          break;
        case "Tab":
          if (flatResults[highlightIndex]) {
            handleSelect(flatResults[highlightIndex].id);
          }
          setOpen(false);
          break;
      }
    };

    // Scroll highlighted item into view
    useEffect(() => {
      if (!open || !listRef.current) return;
      const item = listRef.current.children[highlightIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }, [highlightIndex, open]);

    const clearSelection = () => {
      onSelect("");
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 10);
    };

    return (
      <div ref={containerRef} className="relative">
        {/* Always-visible input */}
        {selectedProduct && !query ? (
          <div
            className="flex items-center h-9 w-full rounded-md border border-input bg-background px-3 text-sm cursor-text group"
            onClick={() => {
              onSelect("");
              setQuery("");
              setTimeout(() => inputRef.current?.focus(), 10);
            }}
          >
            <span className="truncate flex-1 text-foreground">
              {selectedProduct.name}
              {selectedProduct.strength && <span className="text-muted-foreground ml-1 text-xs">{selectedProduct.strength}</span>}
            </span>
            <X
              className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-pointer shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                clearSelection();
              }}
            />
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                if (query.trim() || !selectedProductId) setOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="h-9 pl-8 pr-3"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        )}

        {/* Dropdown */}
        {open && flatResults.length > 0 && (
          <div
            ref={listRef}
            className="absolute z-50 mt-1 w-full min-w-[340px] max-h-[280px] overflow-y-auto rounded-md border bg-popover shadow-lg"
          >
            {flatResults.map((product, idx) => (
              <div
                key={product.id}
                className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer transition-colors ${
                  idx === highlightIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                } ${selectedProductId === product.id ? "font-medium" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(product.id);
                }}
                onMouseEnter={() => setHighlightIndex(idx)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {selectedProductId === product.id && <Check className="h-3 w-3 shrink-0 text-primary" />}
                    <span className="truncate font-medium">{product.name}</span>
                    {product.strength && (
                      <span className="text-muted-foreground text-xs">{product.strength}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {product.generic_name && (
                      <span className="flex items-center gap-0.5">
                        <Pill className="h-2.5 w-2.5" />
                        {product.generic_name}
                      </span>
                    )}
                    {product.manufacturer && <span>{product.manufacturer}</span>}
                  </div>
                </div>
                {showPrice && (
                  <span className="text-sm font-mono text-right ml-3 shrink-0">
                    ₹{getDisplayPrice(product)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
        {open && query.trim() && flatResults.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg p-3 text-sm text-muted-foreground text-center">
            No product found.
          </div>
        )}
      </div>
    );
  }
);
