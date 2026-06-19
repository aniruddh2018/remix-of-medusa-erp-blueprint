import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { FocusProvider } from "@/contexts/FocusContext";
import { AppLayout } from "@/components/layout/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import Inventory from "./pages/Inventory";
import Expiry from "./pages/Expiry";
import ScheduledDrugs from "./pages/ScheduledDrugs";
import PurchaseOrders from "./pages/PurchaseOrders";
import Sales from "./pages/Sales";
import Quotations from "./pages/Quotations";
import Suppliers from "./pages/Suppliers";
import Customers from "./pages/Customers";
import Doctors from "./pages/Doctors";
import Reports from "./pages/Reports";
import DoctorReports from "./pages/DoctorReports";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import SuperAdmin from "./pages/SuperAdmin";
import Notes from "./pages/Notes";
import Accounts from "./pages/Accounts";
import AuditLogs from "./pages/AuditLogs";
import Install from "./pages/Install";
import Onboarding from "./pages/Onboarding";
import DataImport from "./pages/DataImport";
import MigrationDashboard from "./pages/MigrationDashboard";
import ScanInvoice from "./pages/ScanInvoice";
import CounterSales from "./pages/CounterSales";
import Chat from "./pages/Chat";
import QueryEngine from "./pages/QueryEngine";
import Portfolio from "./pages/Portfolio";
import Prescriptions from "./pages/Prescriptions";
import LandingPage from "./pages/LandingPage";
import GSTFiling from "./pages/GSTFiling";

import NotFound from "./pages/NotFound";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <BusinessProvider>
            <FocusProvider>
            <Routes>
              {/* Public pages — no auth required */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/install" element={<Install />} />
              <Route path="/onboarding" element={<Onboarding />} />
              {/* Protected app pages */}
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/products" element={<Products />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/expiry" element={<Expiry />} />
                <Route path="/scheduled-drugs" element={<ScheduledDrugs />} />
                <Route path="/purchase-orders" element={<PurchaseOrders />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/suppliers" element={<Suppliers />} />
                <Route path="/customers" element={<Customers />} />
                <Route path="/doctors" element={<Doctors />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/doctors" element={<DoctorReports />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/super-admin" element={<SuperAdmin />} />
                <Route path="/data-import" element={<DataImport />} />
                <Route path="/migration" element={<MigrationDashboard />} />
                <Route path="/scan-invoice" element={<ScanInvoice />} />
      
                <Route path="/counter-sales" element={<CounterSales />} />
                <Route path="/prescriptions" element={<Prescriptions />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/agent" element={<Navigate to="/chat" replace />} />

                <Route path="/query" element={<QueryEngine />} />
                <Route path="/notes" element={<Notes />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/gst-filing" element={<GSTFiling />} />
                <Route path="/audit-logs" element={<AuditLogs />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
            </FocusProvider>
          </BusinessProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

