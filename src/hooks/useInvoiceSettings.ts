import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

export interface FullInvoiceSettings {
  // Company
  company_name: string;
  company_address: string;
  company_phone: string;
  company_email: string;
  company_gstin: string;
  company_state: string;
  logo_url: string;
  logo_alignment: string;
  invoice_prefix: string;
  quotation_prefix: string;
  invoice_format: string;
  terms_and_conditions: string;
  // Sections
  show_ship_to: boolean;
  show_due_date: boolean;
  show_previous_balance: boolean;
  show_tax_summary: boolean;
  show_amount_in_words: boolean;
  show_customer_gstin: boolean;
  // Column visibility
  show_batch_column: boolean;
  show_expiry_column: boolean;
  show_free_qty_column: boolean;
  show_hsn_column: boolean;
  show_tax_amount_column: boolean;
  show_rate_column: boolean;
  show_roundoff: boolean;
  show_gst_split: boolean;
  show_salesperson: boolean;
  // Discount
  discount_mode: string;
  show_discount_row: boolean;
  enable_bill_discount: boolean;
  bill_discount_mode: string;
  max_discount_admin: number;
  max_discount_pharmacist: number;
  max_discount_staff: number;
  discount_before_tax: boolean;
  // Layout & Print
  invoice_layout: string;
  print_font_size: string;
  print_alignment: string;
  // Business rules
  enable_batch_tracking: boolean;
  enable_expiry_tracking: boolean;
  allow_negative_stock: boolean;
  default_payment_method: string;
  default_customer_name: string;
  // Bank
  bank_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_branch: string;
  bank_account_holder: string;
  // Per-schedule prescription enforcement
  prescription_check: {
    schedule_h?: boolean;
    schedule_h1?: boolean;
    schedule_x?: boolean;
    narcotic?: boolean;
  };
}

const DEFAULTS: FullInvoiceSettings = {
  company_name: "",
  company_address: "",
  company_phone: "",
  company_email: "",
  company_gstin: "",
  company_state: "",
  logo_url: "",
  logo_alignment: "left",
  invoice_prefix: "INV-",
  invoice_format: "standard",
  terms_and_conditions: "Thanks for doing business with us!",
  show_ship_to: true,
  show_due_date: true,
  show_previous_balance: true,
  show_tax_summary: true,
  show_amount_in_words: true,
  show_customer_gstin: true,
  show_batch_column: true,
  show_expiry_column: true,
  show_free_qty_column: true,
  show_hsn_column: true,
  show_tax_amount_column: false,
  show_rate_column: true,
  show_roundoff: true,
  show_gst_split: true,
  show_salesperson: false,
  discount_mode: "both",
  show_discount_row: true,
  enable_bill_discount: true,
  bill_discount_mode: "both",
  max_discount_admin: 100,
  max_discount_pharmacist: 50,
  max_discount_staff: 15,
  discount_before_tax: true,
  invoice_layout: "a4",
  print_font_size: "medium",
  print_alignment: "left",
  enable_batch_tracking: true,
  enable_expiry_tracking: true,
  allow_negative_stock: false,
  default_payment_method: "cash",
  default_customer_name: "Walk-in Customer",
  bank_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_branch: "",
  bank_account_holder: "",
  prescription_check: {
    schedule_h: false,
    schedule_h1: true,
    schedule_x: true,
    narcotic: true,
  },
};

export function useInvoiceSettings() {
  const { companyId } = useBusiness();
  const { isAdmin, isPharmacist } = useAuth();

  const { data: rawSettings, isLoading } = useQuery({
    queryKey: ["invoice-settings", companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from("invoice_settings")
        .select("*")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!companyId,
  });

  const settings: FullInvoiceSettings = useMemo(() => {
    if (!rawSettings) return DEFAULTS;
    const s = rawSettings as any;
    return {
      ...DEFAULTS,
      ...Object.fromEntries(
        Object.entries(DEFAULTS).map(([key, defaultVal]) => [
          key,
          s[key] !== undefined && s[key] !== null ? s[key] : defaultVal,
        ])
      ),
    } as FullInvoiceSettings;
  }, [rawSettings]);

  const maxDiscountAllowed = useMemo(() => {
    if (isAdmin) return settings.max_discount_admin;
    if (isPharmacist) return settings.max_discount_pharmacist;
    return settings.max_discount_staff;
  }, [isAdmin, isPharmacist, settings]);

  return { settings, isLoading, maxDiscountAllowed, rawSettings };
}
