import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BusinessType = "pharmacy" | "pharmacy_b2b" | "b2b_electronics" | "general_trading";

export interface BusinessConfig {
  type: BusinessType;
  label: string;
  hasBatchTracking: boolean;
  hasDrugSchedule: boolean;
  hasExpiryTracking: boolean;
  hasScheduledDrugs: boolean;
  hasStrength: boolean;
  hasComposition: boolean;
  hasGenericName: boolean;
  hasPrescription: boolean;
  requiresCustomerGST: boolean;
  hasChallanSystem: boolean;
  terms: {
    product: string;
    products: string;
    manufacturer: string;
    category: string;
    brandName: string;
    mrp: string;
    unit: string;
    counterSale: string;
    appName: string;
    tagline: string;
  };
  categories: string[];
  units: { value: string; label: string }[];
  visiblePages: string[];
}

const BUSINESS_CONFIGS: Record<BusinessType, BusinessConfig> = {
  pharmacy: {
    type: "pharmacy",
    label: "Pharmacy",
    hasBatchTracking: true,
    hasDrugSchedule: true,
    hasExpiryTracking: true,
    hasScheduledDrugs: true,
    hasStrength: true,
    hasComposition: true,
    hasGenericName: true,
    hasPrescription: true,
    requiresCustomerGST: false,
    hasChallanSystem: true,
    terms: {
      product: "Product", products: "Products", manufacturer: "Manufacturer",
      category: "Category", brandName: "Brand Name", mrp: "MRP", unit: "Unit",
      counterSale: "Quick Counter Sale", appName: "MedikaRP", tagline: "Pharmacy Management",
    },
    categories: ["Tablets", "Capsules", "Syrups", "Injections", "Ointments", "Drops", "Inhalers", "Powders", "Sachets", "Suppositories", "Patches", "Other"],
    units: [
      { value: "pcs", label: "Pieces" }, { value: "strip", label: "Strip" },
      { value: "bottle", label: "Bottle" }, { value: "box", label: "Box" },
      { value: "tube", label: "Tube" }, { value: "vial", label: "Vial" }, { value: "amp", label: "Ampoule" },
    ],
    visiblePages: ["/dashboard", "/chat", "/products", "/inventory", "/expiry", "/prescriptions", "/scheduled-drugs", "/purchase-orders", "/sales", "/counter-sales", "/scan-invoice", "/suppliers", "/customers", "/doctors", "/reports", "/audit-logs", "/admin", "/notes", "/accounts", "/settings"],
  },
  pharmacy_b2b: {
    type: "pharmacy_b2b",
    label: "Pharmacy B2B",
    hasBatchTracking: true,
    hasDrugSchedule: true,
    hasExpiryTracking: true,
    hasScheduledDrugs: true,
    hasStrength: true,
    hasComposition: true,
    hasGenericName: true,
    hasPrescription: true,
    requiresCustomerGST: true,
    hasChallanSystem: true,
    terms: {
      product: "Product", products: "Products", manufacturer: "Manufacturer",
      category: "Category", brandName: "Brand Name", mrp: "MRP", unit: "Unit",
      counterSale: "Quick Counter Sale", appName: "MedikaRP B2B", tagline: "Pharmacy B2B Management",
    },
    categories: ["Tablets", "Capsules", "Syrups", "Injections", "Ointments", "Drops", "Inhalers", "Powders", "Sachets", "Suppositories", "Patches", "Other"],
    units: [
      { value: "pcs", label: "Pieces" }, { value: "strip", label: "Strip" },
      { value: "bottle", label: "Bottle" }, { value: "box", label: "Box" },
      { value: "tube", label: "Tube" }, { value: "vial", label: "Vial" }, { value: "amp", label: "Ampoule" },
    ],
    visiblePages: ["/dashboard", "/chat", "/products", "/inventory", "/expiry", "/prescriptions", "/scheduled-drugs", "/purchase-orders", "/sales", "/counter-sales", "/scan-invoice", "/suppliers", "/customers", "/doctors", "/reports", "/audit-logs", "/admin", "/notes", "/accounts", "/settings"],
  },
  b2b_electronics: {
    type: "b2b_electronics",
    label: "B2B Electronics",
    hasBatchTracking: false,
    hasDrugSchedule: false,
    hasExpiryTracking: false,
    hasScheduledDrugs: false,
    hasStrength: false,
    hasComposition: false,
    hasGenericName: false,
    hasPrescription: false,
    requiresCustomerGST: true,
    hasChallanSystem: true,
    terms: {
      product: "Product", products: "Products", manufacturer: "Brand / OEM",
      category: "Category", brandName: "Product Name", mrp: "List Price", unit: "Unit",
      counterSale: "Quick Sale", appName: "ElectraERP", tagline: "B2B Electronics Management",
    },
    categories: ["Smartphones", "Laptops", "Tablets", "Monitors", "Printers", "Networking", "Cables & Connectors", "Power Supply", "Storage Devices", "Audio & Video", "Components", "Accessories", "Other"],
    units: [
      { value: "pcs", label: "Pieces" }, { value: "box", label: "Box" },
      { value: "carton", label: "Carton" }, { value: "set", label: "Set" },
      { value: "pair", label: "Pair" }, { value: "meter", label: "Meter" }, { value: "kg", label: "Kilogram" },
    ],
    visiblePages: ["/dashboard", "/chat", "/products", "/inventory", "/purchase-orders", "/sales", "/scan-invoice", "/product-mapping-review", "/suppliers", "/customers", "/reports", "/audit-logs", "/admin", "/notes", "/accounts", "/settings"],
  },
  general_trading: {
    type: "general_trading",
    label: "General Trading",
    hasBatchTracking: false,
    hasDrugSchedule: false,
    hasExpiryTracking: true,
    hasScheduledDrugs: false,
    hasStrength: false,
    hasComposition: false,
    hasGenericName: false,
    hasPrescription: false,
    requiresCustomerGST: false,
    hasChallanSystem: true,
    terms: {
      product: "Product", products: "Products", manufacturer: "Manufacturer / Brand",
      category: "Category", brandName: "Product Name", mrp: "MRP", unit: "Unit",
      counterSale: "Quick Sale", appName: "TradeERP", tagline: "Trading & Distribution",
    },
    categories: ["FMCG", "Grocery", "Hardware", "Textiles", "Stationery", "Home & Kitchen", "Industrial", "Electrical", "Other"],
    units: [
      { value: "pcs", label: "Pieces" }, { value: "box", label: "Box" },
      { value: "carton", label: "Carton" }, { value: "kg", label: "Kilogram" },
      { value: "liter", label: "Liter" }, { value: "meter", label: "Meter" }, { value: "dozen", label: "Dozen" },
    ],
    visiblePages: ["/dashboard", "/chat", "/products", "/inventory", "/expiry", "/purchase-orders", "/sales", "/scan-invoice", "/suppliers", "/customers", "/reports", "/audit-logs", "/admin", "/notes", "/accounts", "/settings"],
  },
};

interface BusinessContextType {
  config: BusinessConfig;
  businessType: BusinessType;
  companyId: string | null;
  setBusinessType: (type: BusinessType) => Promise<void>;
  isLoading: boolean;
  needsOnboarding: boolean;
  companyName: string;
  setCompanyName: (name: string) => Promise<void>;
  gstInclusive: boolean;
  setGstInclusive: (value: boolean) => Promise<void>;
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [businessType, setBusinessTypeState] = useState<BusinessType>("pharmacy");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [companyName, setCompanyNameState] = useState("");
  const [gstInclusive, setGstInclusiveState] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading (including roles) before deciding
    if (authLoading) return;

    // No user → not loading, no onboarding needed
    if (!user) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const fetchProfile = async () => {
      console.log("[Business] Fetching profile for user:", user.id);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("business_module, full_name, company_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!mounted) return;

        if (error) {
          console.error("[Business] Error fetching profile:", error);
          setIsLoading(false);
          return;
        }

        console.log("[Business] Profile data:", data);

        if (data) {
          setCompanyId(data.company_id || null);
          setCompanyNameState(data.full_name || "");

          if (data.company_id) {
            console.log("[Business] Fetching company:", data.company_id);
            const { data: companyData } = await supabase
              .from("companies")
              .select("business_type, name, gst_inclusive")
              .eq("id", data.company_id)
              .maybeSingle();

            if (!mounted) return;

            console.log("[Business] Company data:", companyData);

            if (companyData) {
              const companyType = companyData.business_type as BusinessType;
              if (companyType && BUSINESS_CONFIGS[companyType]) {
                setBusinessTypeState(companyType);
              }
              if (companyData.name) {
                setCompanyNameState(companyData.name);
              }
              setGstInclusiveState(companyData.gst_inclusive ?? false);
            }
            setNeedsOnboarding(false);
          } else {
            const module = data.business_module as BusinessType;
            if (module && BUSINESS_CONFIGS[module]) {
              setBusinessTypeState(module);
            }
            setNeedsOnboarding(!isSuperAdmin);
          }
        } else {
          console.warn("[Business] No profile found for user");
          setNeedsOnboarding(!isSuperAdmin);
        }
      } catch (err) {
        console.error("[Business] fetchProfile failed:", err);
      }

      if (mounted) setIsLoading(false);
    };

    fetchProfile();

    return () => { mounted = false; };
  }, [user, authLoading, isSuperAdmin]);

  const setBusinessType = async (type: BusinessType) => {
    if (!user || !companyId) return;
    const { error } = await supabase
      .from("companies")
      .update({ business_type: type })
      .eq("id", companyId);

    if (!error) {
      setBusinessTypeState(type);
      await supabase
        .from("profiles")
        .update({ business_module: type })
        .eq("user_id", user.id);
    }
  };

  const setCompanyName = async (name: string) => {
    if (!companyId) return;
    const { error } = await supabase
      .from("companies")
      .update({ name })
      .eq("id", companyId);

    if (!error) {
      setCompanyNameState(name);
    }
  };

  const setGstInclusive = async (value: boolean) => {
    if (!companyId) return;
    const { error } = await supabase
      .from("companies")
      .update({ gst_inclusive: value })
      .eq("id", companyId);

    if (!error) {
      setGstInclusiveState(value);
    }
  };

  const config = BUSINESS_CONFIGS[businessType] || BUSINESS_CONFIGS.pharmacy;

  return (
    <BusinessContext.Provider
      value={{
        config,
        businessType,
        companyId,
        setBusinessType,
        isLoading,
        needsOnboarding,
        companyName,
        setCompanyName,
        gstInclusive,
        setGstInclusive,
      }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used within a BusinessProvider");
  }
  return context;
}

export { BUSINESS_CONFIGS };
