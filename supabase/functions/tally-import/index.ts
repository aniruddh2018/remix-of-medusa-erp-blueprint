import { XMLParser } from "npm:fast-xml-parser@4.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface StockItem {
  name: string;
  category: string;
  hsn_code: string;
  gst_percentage: string;
  unit: string;
  purchase_price: string;
  mrp: string;
  opening_balance: string;
  opening_value: string;
}

interface SupplierLedger {
  name: string;
  gstin: string;
  phone: string;
  address: string;
  state: string;
  parent_group: string;
  pan: string;
}

interface CustomerLedger {
  name: string;
  gstin: string;
  phone: string;
  address: string;
  state: string;
  parent_group: string;
}

interface StockGroup {
  name: string;
  parent: string;
}

interface UnitInfo {
  name: string;
  parent: string;
}

interface TallyGroup {
  name: string;
  parent: string;
  affects_stock: string;
}

interface GodownInfo {
  name: string;
  parent: string;
}

interface FullLedger {
  name: string;
  parent_group: string;
  ledger_type: string;
  gstin: string;
  pan: string;
  phone: string;
  email: string;
  address: string;
  state: string;
  opening_balance: string;
  source_data: Record<string, unknown>;
}

interface GstRateDetail {
  hsn_code: string;
  cgst_rate: number;
  sgst_rate: number;
  igst_rate: number;
  effective_rate: number;
}

interface ParseResult {
  source_system: "tally" | "marg";
  company_name: string;
  summary: {
    groups: number;
    stockGroups: number;
    units: number;
    godowns: number;
    suppliers: number;
    customers: number;
    stockItems: number;
    allLedgers: number;
    skippedLedgers: number;
    gstRates: number;
  };
  groups: TallyGroup[];
  stockGroups: StockGroup[];
  units: UnitInfo[];
  godowns: GodownInfo[];
  suppliers: SupplierLedger[];
  customers: CustomerLedger[];
  stockItems: StockItem[];
  allLedgers: FullLedger[];
  skippedLedgers: string[];
  gstRates: GstRateDetail[];
}

function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node === "string") return node.trim();
  if (typeof node === "number") return String(node);
  if (typeof node === "object" && node !== null && "#text" in (node as Record<string, unknown>)) {
    return String((node as Record<string, unknown>)["#text"] || "").trim();
  }
  return String(node).trim();
}

function childText(parent: Record<string, unknown>, tag: string): string {
  if (!parent || typeof parent !== "object") return "";
  return text(parent[tag]);
}

function extractGstDetails(stockItemNode: Record<string, unknown>): { hsn_code: string; gst_percentage: string; cgst_rate: number; sgst_rate: number; igst_rate: number } {
  let hsn_code = "";
  let gst_percentage = "";
  let cgstRate = 0, sgstRate = 0, igstRate = 0;

  const langList = stockItemNode["LANGUAGENAME.LIST"] as Record<string, unknown> | undefined;
  const gstDetails = langList?.["GSTDETAILS.LIST"];
  if (gstDetails && typeof gstDetails === "object") {
    const gd = gstDetails as Record<string, unknown>;
    hsn_code = childText(gd, "HSNCODE") || childText(gd, "HSN");
    const svdList = gd["STATEWISEDETAILS.LIST"];
    if (svdList && typeof svdList === "object") {
      const svd = svdList as Record<string, unknown>;
      const rdList = svd["RATEDETAILS.LIST"];
      if (rdList) {
        const rates = Array.isArray(rdList) ? rdList : [rdList];
        for (const r of rates) {
          if (!r || typeof r !== "object") continue;
          const rr = r as Record<string, unknown>;
          const dutyHead = childText(rr, "GSTRATEDUTYHEAD");
          const rate = parseFloat(childText(rr, "GSTRATE")) || 0;
          if (dutyHead.includes("Central Tax")) cgstRate = rate;
          else if (dutyHead.includes("State Tax")) sgstRate = rate;
          else if (dutyHead.includes("Integrated Tax")) igstRate = rate;
        }
        const effectiveRate = igstRate > 0 ? igstRate : cgstRate + sgstRate;
        gst_percentage = String(effectiveRate);
      }
    }
  }

  if (!gst_percentage) {
    const rateOfVat = childText(stockItemNode, "RATEOFVAT");
    if (rateOfVat) {
      gst_percentage = rateOfVat;
      cgstRate = parseFloat(rateOfVat) / 2;
      sgstRate = cgstRate;
    }
  }

  return { hsn_code, gst_percentage, cgst_rate: cgstRate, sgst_rate: sgstRate, igst_rate: igstRate };
}

function extractLedgerMailing(parent: Record<string, unknown>): { phone: string; address: string; state: string } {
  let address = "";
  let state = "";

  const mailingList = parent["LEDMAILINGDETAILS.LIST"];
  if (mailingList && typeof mailingList === "object") {
    const ml = mailingList as Record<string, unknown>;
    address = childText(ml, "ADDRESS") || "";
    state = childText(ml, "STATE") || "";
  }

  if (!address) {
    const addrList = parent["ADDRESS.LIST"] as Record<string, unknown> | undefined;
    address = addrList ? childText(addrList, "ADDRESS") : "";
  }
  if (!state) {
    state = childText(parent, "LEDSTATENAME");
  }

  const phone = childText(parent, "LEDGERMOBILE") || childText(parent, "PHONE");
  return { phone, address, state };
}

function extractLedgerGstin(parent: Record<string, unknown>): string {
  const gstDetails = parent["LEDGSTREGDETAILS.LIST"] as Record<string, unknown> | undefined;
  if (gstDetails) {
    const gstin = childText(gstDetails, "GSTIN") || childText(gstDetails, "PARTYGSTIN") || "";
    if (gstin) return gstin;
  }
  return childText(parent, "PARTYGSTIN");
}

function classifyLedger(parentGroup: string): string {
  const g = parentGroup.toUpperCase();
  if (g.includes("SUNDRY CREDITOR") || g.includes("CREDITOR")) return "supplier";
  if (g.includes("SUNDRY DEBTOR") || g.includes("DEBTOR")) return "customer";
  if (g.includes("BANK ACCOUNT") || g.includes("BANK")) return "bank";
  if (g.includes("CASH-IN-HAND") || g.includes("CASH")) return "cash";
  if (g.includes("DUTIES") || g.includes("TAX")) return "gst";
  if (g.includes("PURCHASE ACCOUNT") || g.includes("SALES ACCOUNT")) return "income";
  if (g.includes("EXPENSE") || g.includes("INTEREST")) return "expense";
  if (g.includes("FIXED ASSET") || g.includes("CAPITAL") || g.includes("INVESTMENT")) return "asset";
  if (g.includes("LIABILIT") || g.includes("PROVISION") || g.includes("RESERVES")) return "liability";
  if (g.includes("REVENUE") || g.includes("INCOME")) return "income";
  return "general";
}

function parseStockItem(node: Record<string, unknown>): StockItem {
  const name = text(node.NAME);
  const category = childText(node, "PARENT");
  const unit = childText(node, "BASEUNITS") || "PCS";
  const openingRate = childText(node, "OPENINGRATE") || "0.00";
  const openingBalance = childText(node, "OPENINGBALANCE") || "0.00";
  const openingValue = childText(node, "OPENINGVALUE") || "0.00";
  const { hsn_code, gst_percentage } = extractGstDetails(node);
  const mrp = childText(node, "MRP");

  return {
    name,
    category,
    hsn_code,
    gst_percentage,
    unit,
    purchase_price: openingRate,
    mrp,
    opening_balance: openingBalance.replace(/[^0-9.\-]/g, ""),
    opening_value: openingValue,
  };
}

function parseFullLedger(node: Record<string, unknown>): FullLedger {
  const name = text(node.NAME);
  const parentGroup = childText(node, "PARENT");
  const gstin = extractLedgerGstin(node);
  const { phone, address, state } = extractLedgerMailing(node);
  const pan = childText(node, "INCOMETAXNUMBER");
  const email = childText(node, "EMAIL");
  const openingBalance = childText(node, "OPENINGBALANCE");

  return {
    name,
    parent_group: parentGroup,
    ledger_type: classifyLedger(parentGroup),
    gstin,
    pan,
    phone,
    email,
    address,
    state,
    opening_balance: openingBalance.replace(/[^0-9.\-]/g, "") || "0",
    source_data: {},
  };
}

function parseStockGroup(node: Record<string, unknown>): StockGroup {
  return {
    name: text(node.NAME),
    parent: childText(node, "PARENT"),
  };
}

function parseUnit(node: Record<string, unknown>): UnitInfo {
  return {
    name: text(node.NAME),
    parent: childText(node, "PARENT"),
  };
}

function parseGroup(node: Record<string, unknown>): TallyGroup {
  return {
    name: text(node.NAME),
    parent: childText(node, "PARENT"),
    affects_stock: childText(node, "AFFECTSSTOCK"),
  };
}

function parseGodown(node: Record<string, unknown>): GodownInfo {
  return {
    name: text(node.NAME),
    parent: childText(node, "PARENT"),
  };
}

function parseTallyMastersStream(xmlText: string): ParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: () => false,
  });

  const groups: TallyGroup[] = [];
  const stockGroups: StockGroup[] = [];
  const units: UnitInfo[] = [];
  const godowns: GodownInfo[] = [];
  const suppliers: SupplierLedger[] = [];
  const customers: CustomerLedger[] = [];
  const stockItems: StockItem[] = [];
  const allLedgers: FullLedger[] = [];
  const skippedLedgers: string[] = [];
  const gstRateSet = new Map<string, GstRateDetail>();

  let companyName = "";

  const headerMatch = xmlText.match(/<SVCURRENTCOMPANY>([^<]+)<\/SVCURRENTCOMPANY>/);
  if (headerMatch) companyName = headerMatch[1].trim();

  const blocks = xmlText.split(/(?=<TALLYMESSAGE\b)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !trimmed.startsWith("<TALLYMESSAGE")) continue;

    try {
      const parsed = parser.parse(trimmed);
      const msg = parsed?.TALLYMESSAGE as Record<string, unknown> | undefined;
      if (!msg) continue;

      if (msg.GROUP) {
        groups.push(parseGroup(msg.GROUP as Record<string, unknown>));
      } else if (msg.STOCKGROUP) {
        stockGroups.push(parseStockGroup(msg.STOCKGROUP as Record<string, unknown>));
      } else if (msg.UNIT) {
        units.push(parseUnit(msg.UNIT as Record<string, unknown>));
      } else if (msg.GODOWN) {
        godowns.push(parseGodown(msg.GODOWN as Record<string, unknown>));
      } else if (msg.LEDGER) {
        const ledgerNode = msg.LEDGER as Record<string, unknown>;
        const fullLedger = parseFullLedger(ledgerNode);
        allLedgers.push(fullLedger);

        const parentGroup = childText(ledgerNode, "PARENT");
        const name = text(ledgerNode.NAME);
        const upperGroup = parentGroup.toUpperCase();

        const isSupplier = upperGroup.includes("SUNDRY CREDITOR") || upperGroup.includes("CREDITOR");
        const isCustomer = upperGroup.includes("SUNDRY DEBTOR") || upperGroup.includes("DEBTOR");

        if (isSupplier) {
          const gstin = extractLedgerGstin(ledgerNode);
          const { phone, address, state } = extractLedgerMailing(ledgerNode);
          const pan = childText(ledgerNode, "INCOMETAXNUMBER");
          suppliers.push({ name, gstin, phone, address, state, parent_group: parentGroup, pan });
        } else if (isCustomer) {
          const gstin = extractLedgerGstin(ledgerNode);
          const { phone, address, state } = extractLedgerMailing(ledgerNode);
          customers.push({ name, gstin, phone, address, state, parent_group: parentGroup });
        } else {
          skippedLedgers.push(name);
        }
      } else if (msg.STOCKITEM) {
        const stockItemNode = msg.STOCKITEM as Record<string, unknown>;
        stockItems.push(parseStockItem(stockItemNode));

        const { hsn_code, cgst_rate, sgst_rate, igst_rate } = extractGstDetails(stockItemNode);
        const effective = igst_rate > 0 ? igst_rate : cgst_rate + sgst_rate;
        if (effective > 0) {
          const key = `${hsn_code || "_"}_${effective}`;
          if (!gstRateSet.has(key)) {
            gstRateSet.set(key, {
              hsn_code: hsn_code || "",
              cgst_rate,
              sgst_rate,
              igst_rate,
              effective_rate: effective,
            });
          }
        }
      }
    } catch {
      // Skip unparseable blocks
    }
  }

  const gstRates = Array.from(gstRateSet.values());

  return {
    source_system: "tally",
    company_name: companyName,
    summary: {
      groups: groups.length,
      stockGroups: stockGroups.length,
      units: units.length,
      godowns: godowns.length,
      suppliers: suppliers.length,
      customers: customers.length,
      stockItems: stockItems.length,
      allLedgers: allLedgers.length,
      skippedLedgers: skippedLedgers.length,
      gstRates: gstRates.length,
    },
    groups,
    stockGroups,
    units,
    godowns,
    suppliers,
    customers,
    stockItems,
    allLedgers,
    skippedLedgers,
    gstRates,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = req.headers.get("content-type") || "";
    let xmlText: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return new Response(
          JSON.stringify({ error: "No file provided in form data" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      xmlText = await file.text();
    } else if (contentType.includes("application/json")) {
      const body = await req.json() as Record<string, unknown>;
      if (typeof body.xml === "string") {
        xmlText = body.xml;
      } else {
        return new Response(
          JSON.stringify({ error: "Missing 'xml' field in JSON body" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Unsupported content type. Use multipart/form-data or application/json" }),
        { status: 415, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = parseTallyMastersStream(xmlText);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
