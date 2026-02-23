import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type BusinessType = "pharmacy" | "b2b_electronics" | "general_trading";

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
    visiblePages: ["/", "/products", "/inventory", "/expiry", "/scheduled-drugs", "/purchase-orders", "/sales", "/suppliers", "/customers", "/reports", "/admin", "/notes", "/accounts", "/settings"],
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
    visiblePages: ["/", "/products", "/inventory", "/purchase-orders", "/sales", "/suppliers", "/customers", "/reports", "/admin", "/notes", "/accounts", "/settings"],
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
    visiblePages: ["/", "/products", "/inventory", "/expiry", "/purchase-orders", "/sales", "/suppliers", "/customers", "/reports", "/admin", "/notes", "/accounts", "/settings"],
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
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, isSuperAdmin } = useAuth();
  const [businessType, setBusinessTypeState] = useState<BusinessType>("pharmacy");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const [companyName, setCompanyNameState] = useState("");

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("business_module, full_name, company_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile:", error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const module = data.business_module as BusinessType;
        if (module && BUSINESS_CONFIGS[module]) {
          setBusinessTypeState(module);
        }
        setCompanyId(data.company_id || null);
        setCompanyNameState(data.full_name || "");

        // Only need onboarding if no company_id assigned AND not super admin
        // Super admins don't need onboarding - they manage companies
        if (!data.company_id && !isSuperAdmin) {
          setNeedsOnboarding(true);
        } else {
          setNeedsOnboarding(false);
        }
      } else {
        // No profile at all — super admins still don't need onboarding
        if (!isSuperAdmin) {
          setNeedsOnboarding(true);
        }
      }

      setIsLoading(false);
    };

    fetchProfile();
  }, [user, isSuperAdmin]);

  const setBusinessType = async (type: BusinessType) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ business_module: type })
      .eq("user_id", user.id);

    if (!error) {
      setBusinessTypeState(type);
      setNeedsOnboarding(false);
    }
  };

  const setCompanyName = async (name: string) => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: name })
      .eq("user_id", user.id);

    if (!error) {
      setCompanyNameState(name);
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
