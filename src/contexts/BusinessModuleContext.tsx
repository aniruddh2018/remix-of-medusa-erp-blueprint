import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BusinessModule, ModuleConfig, MODULE_CONFIGS } from "@/config/businessModules";
import { useAuth } from "@/contexts/AuthContext";

interface BusinessModuleContextType {
  activeModule: BusinessModule;
  moduleConfig: ModuleConfig;
  setModule: (module: BusinessModule) => Promise<void>;
  loading: boolean;
}

const BusinessModuleContext = createContext<BusinessModuleContextType | undefined>(undefined);

export function BusinessModuleProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [activeModule, setActiveModule] = useState<BusinessModule>("pharmacy");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchUserModule();
  }, [user]);

  const fetchUserModule = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("business_module")
        .eq("user_id", user.id)
        .single();

      if (data?.business_module) {
        setActiveModule(data.business_module as BusinessModule);
      }
    } catch (err) {
      console.error("Failed to fetch business module:", err);
    } finally {
      setLoading(false);
    }
  };

  const setModule = async (module: BusinessModule) => {
    setActiveModule(module);
    if (!user) return;
    await supabase
      .from("profiles")
      .update({ business_module: module })
      .eq("user_id", user.id);
  };

  return (
    <BusinessModuleContext.Provider
      value={{
        activeModule,
        moduleConfig: MODULE_CONFIGS[activeModule],
        setModule,
        loading,
      }}
    >
      {children}
    </BusinessModuleContext.Provider>
  );
}

export function useBusinessModule() {
  const ctx = useContext(BusinessModuleContext);
  if (!ctx) throw new Error("useBusinessModule must be used within BusinessModuleProvider");
  return ctx;
}
