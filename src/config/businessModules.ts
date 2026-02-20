import {
  LayoutDashboard,
  Package,
  Boxes,
  AlertTriangle,
  ShoppingCart,
  FileText,
  Pill,
  Users,
  Settings,
  Shield,
  BarChart3,
  RotateCcw,
  Zap,
  Shirt,
  Sparkles,
  Factory,
  ShoppingBag,
  Tag,
  Wrench,
  Cpu,
} from "lucide-react";
import { LucideIcon } from "lucide-react";

export type BusinessModule =
  | "pharmacy"
  | "cosmetics"
  | "electronics"
  | "clothing"
  | "general"
  | "manufacturing";

export interface ModuleFeatures {
  scheduledDrugs: boolean;
  expiryTracking: boolean;
  batchTracking: boolean;
  prescriptions: boolean;
  serialNumbers: boolean;
  warrantyTracking: boolean;
  sizes: boolean;
  colors: boolean;
  creditDebitNotes: boolean;
  suppliers: boolean;
  customers: boolean;
  reports: boolean;
  purchaseOrders: boolean;
  sales: boolean;
}

export interface NavItem {
  title: string;
  icon: LucideIcon;
  path: string;
  shortcut?: string | null;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export interface ModuleConfig {
  id: BusinessModule;
  name: string;
  tagline: string;
  icon: LucideIcon;
  color: string; // tailwind bg class
  features: ModuleFeatures;
  terminology: {
    products: string;
    inventory: string;
    purchaseOrders: string;
    salesOrders: string;
    suppliers: string;
  };
  navGroups: NavGroup[];
}

// ──────────────────────────────────────────
// SHARED NAV GROUPS (reusable)
// ──────────────────────────────────────────

const adminNavGroup = (extra: NavItem[] = []): NavGroup => ({
  label: "Admin",
  items: [
    { title: "Reports", icon: BarChart3, path: "/reports" },
    { title: "User Management", icon: Shield, path: "/admin" },
    { title: "Settings", icon: Settings, path: "/settings" },
    ...extra,
  ],
});

const managementGroup = (items: NavItem[]): NavGroup => ({
  label: "Management",
  items,
});

const complianceGroup = (items: NavItem[]): NavGroup => ({
  label: "Compliance",
  items,
});

// ──────────────────────────────────────────
// MODULE DEFINITIONS
// ──────────────────────────────────────────

export const MODULE_CONFIGS: Record<BusinessModule, ModuleConfig> = {
  pharmacy: {
    id: "pharmacy",
    name: "Pharmacy",
    tagline: "Drug inventory, prescriptions & compliance",
    icon: Pill,
    color: "bg-blue-500",
    features: {
      scheduledDrugs: true,
      expiryTracking: true,
      batchTracking: true,
      prescriptions: true,
      serialNumbers: false,
      warrantyTracking: false,
      sizes: false,
      colors: false,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Medicines",
      inventory: "Inventory",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Sales / Billing",
      suppliers: "Suppliers",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Medicines", icon: Package, path: "/products", shortcut: "Alt+5" },
          { title: "Inventory", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
          { title: "Expiry Tracking", icon: AlertTriangle, path: "/expiry" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Sales / Billing", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Compliance",
        items: [
          { title: "Scheduled Drugs", icon: Pill, path: "/scheduled-drugs" },
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Suppliers", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },

  cosmetics: {
    id: "cosmetics",
    name: "Cosmetics & Beauty",
    tagline: "Beauty products, shades & brand management",
    icon: Sparkles,
    color: "bg-pink-500",
    features: {
      scheduledDrugs: false,
      expiryTracking: true,
      batchTracking: true,
      prescriptions: false,
      serialNumbers: false,
      warrantyTracking: false,
      sizes: true,
      colors: true,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Products",
      inventory: "Stock",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Sales / POS",
      suppliers: "Vendors",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Products", icon: Sparkles, path: "/products", shortcut: "Alt+5" },
          { title: "Stock", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
          { title: "Expiry Tracking", icon: AlertTriangle, path: "/expiry" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Sales / POS", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Returns",
        items: [
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Vendors", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },

  electronics: {
    id: "electronics",
    name: "Electronics",
    tagline: "Serial numbers, warranty & repair tracking",
    icon: Cpu,
    color: "bg-cyan-500",
    features: {
      scheduledDrugs: false,
      expiryTracking: false,
      batchTracking: false,
      prescriptions: false,
      serialNumbers: true,
      warrantyTracking: true,
      sizes: false,
      colors: false,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Items / SKUs",
      inventory: "Stock",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Sales / Invoice",
      suppliers: "Distributors",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Items / SKUs", icon: Cpu, path: "/products", shortcut: "Alt+5" },
          { title: "Stock", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Sales / Invoice", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Returns",
        items: [
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Distributors", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },

  clothing: {
    id: "clothing",
    name: "Clothing & Ethnic Wear",
    tagline: "Sizes, colors, fabric & fashion inventory",
    icon: Shirt,
    color: "bg-purple-500",
    features: {
      scheduledDrugs: false,
      expiryTracking: false,
      batchTracking: false,
      prescriptions: false,
      serialNumbers: false,
      warrantyTracking: false,
      sizes: true,
      colors: true,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Products",
      inventory: "Stock",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Sales / POS",
      suppliers: "Vendors",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Products", icon: Shirt, path: "/products", shortcut: "Alt+5" },
          { title: "Stock", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Sales / POS", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Returns",
        items: [
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Vendors", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },

  general: {
    id: "general",
    name: "General / Grocery",
    tagline: "FMCG goods, daily essentials & retail billing",
    icon: ShoppingBag,
    color: "bg-green-500",
    features: {
      scheduledDrugs: false,
      expiryTracking: true,
      batchTracking: true,
      prescriptions: false,
      serialNumbers: false,
      warrantyTracking: false,
      sizes: false,
      colors: false,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Items",
      inventory: "Stock",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Sales / Billing",
      suppliers: "Suppliers",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Items", icon: ShoppingBag, path: "/products", shortcut: "Alt+5" },
          { title: "Stock", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
          { title: "Expiry Tracking", icon: AlertTriangle, path: "/expiry" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Sales / Billing", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Returns",
        items: [
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Suppliers", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },

  manufacturing: {
    id: "manufacturing",
    name: "Manufacturing",
    tagline: "Raw materials, production batches & BOM",
    icon: Factory,
    color: "bg-orange-500",
    features: {
      scheduledDrugs: false,
      expiryTracking: true,
      batchTracking: true,
      prescriptions: false,
      serialNumbers: true,
      warrantyTracking: false,
      sizes: false,
      colors: false,
      creditDebitNotes: true,
      suppliers: true,
      customers: true,
      reports: true,
      purchaseOrders: true,
      sales: true,
    },
    terminology: {
      products: "Products / BOM",
      inventory: "Raw Materials",
      purchaseOrders: "Purchase Orders",
      salesOrders: "Dispatch / Invoice",
      suppliers: "Vendors",
    },
    navGroups: [
      {
        label: "Main",
        items: [
          { title: "Dashboard", icon: LayoutDashboard, path: "/", shortcut: "Alt+1" },
          { title: "Products / BOM", icon: Factory, path: "/products", shortcut: "Alt+5" },
          { title: "Raw Materials", icon: Boxes, path: "/inventory", shortcut: "Alt+4" },
          { title: "Expiry / Shelf Life", icon: AlertTriangle, path: "/expiry" },
        ],
      },
      {
        label: "Orders",
        items: [
          { title: "Purchase Orders", icon: ShoppingCart, path: "/purchase-orders", shortcut: "Alt+3" },
          { title: "Dispatch / Invoice", icon: FileText, path: "/sales", shortcut: "Alt+2" },
        ],
      },
      {
        label: "Returns",
        items: [
          { title: "Credit & Debit Notes", icon: RotateCcw, path: "/notes" },
        ],
      },
      managementGroup([
        { title: "Vendors", icon: Users, path: "/suppliers", shortcut: "Alt+6" },
        { title: "Customers", icon: Users, path: "/customers" },
      ]),
      adminNavGroup(),
    ],
  },
};

export const ALL_MODULES = Object.values(MODULE_CONFIGS);
