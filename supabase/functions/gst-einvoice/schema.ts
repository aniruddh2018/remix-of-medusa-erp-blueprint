// Builds the GST e-Invoice JSON payload (schema v1.1, as notified under the
// GST e-Invoice rules — this schema itself, unlike the NIC transport/auth
// API, is publicly notified and stable). Field names below (Version,
// TranDtls, DocDtls, SellerDtls, BuyerDtls, ItemList, ValDtls, EwbDtls) are
// the notified GSTN schema field names, not NIC-specific.

export interface EInvoiceItem {
  hsnCode: string;
  description: string;
  quantity: number;
  freeQuantity: number;
  unit: string;
  unitPrice: number;
  discount: number;
  gstRate: number;
  isService: boolean;
}

export interface EInvoiceSellerBuyer {
  gstin: string;
  legalName: string;
  tradeName?: string;
  address1: string;
  address2?: string;
  location: string;
  pincode: string;
  stateCode: string;
  phone?: string;
  email?: string;
}

export interface EInvoiceInput {
  docNumber: string;
  docDate: string; // ISO yyyy-mm-dd
  isInterstate: boolean;
  posStateCode: string;
  seller: EInvoiceSellerBuyer;
  buyer: EInvoiceSellerBuyer;
  items: EInvoiceItem[];
  discountAmount: number;
  otherCharges: number;
  roundOff: number;
  eway?: {
    transporterId?: string;
    transporterName?: string;
    transportMode?: "1" | "2" | "3" | "4"; // Road/Rail/Air/Ship
    transportDocNo?: string;
    transportDocDate?: string;
    vehicleNumber?: string;
    distanceKm?: number;
  };
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function ddmmyyyy(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function party(p: EInvoiceSellerBuyer, extra?: Record<string, unknown>) {
  return {
    Gstin: p.gstin,
    LglNm: p.legalName,
    TrdNm: p.tradeName || p.legalName,
    Addr1: p.address1 || "NA",
    ...(p.address2 ? { Addr2: p.address2 } : {}),
    Loc: p.location || "NA",
    Pin: Number(p.pincode) || 999999,
    Stcd: p.stateCode,
    ...(p.phone ? { Ph: p.phone } : {}),
    ...(p.email ? { Em: p.email } : {}),
    ...extra,
  };
}

/** Build the NIC-schema JSON body for a "generate IRN" request. */
export function buildEInvoicePayload(input: EInvoiceInput) {
  let assVal = 0, cgstVal = 0, sgstVal = 0, igstVal = 0;

  const itemList = input.items.map((it, i) => {
    const gross = it.quantity * it.unitPrice - it.discount;
    const taxable = r2(gross);
    const tax = r2(taxable * (it.gstRate / 100));
    const igst = input.isInterstate ? tax : 0;
    const cgst = input.isInterstate ? 0 : r2(tax / 2);
    const sgst = input.isInterstate ? 0 : r2(tax - cgst);
    assVal += taxable;
    igstVal += igst;
    cgstVal += cgst;
    sgstVal += sgst;
    return {
      SlNo: String(i + 1),
      IsServc: it.isService ? "Y" : "N",
      HsnCd: it.hsnCode || "3004",
      PrdDesc: it.description.slice(0, 300),
      Qty: it.quantity,
      FreeQty: it.freeQuantity || 0,
      Unit: it.unit || "NOS",
      UnitPrice: r2(it.unitPrice),
      TotAmt: r2(it.quantity * it.unitPrice),
      Discount: r2(it.discount),
      AssAmt: taxable,
      GstRt: it.gstRate,
      IgstAmt: igst,
      CgstAmt: cgst,
      SgstAmt: sgst,
      CesRt: 0,
      CesAmt: 0,
      CesNonAdvlAmt: 0,
      StateCesRt: 0,
      StateCesAmt: 0,
      StateCesNonAdvlAmt: 0,
      OthChrg: 0,
      TotItemVal: r2(taxable + igst + cgst + sgst),
    };
  });

  assVal = r2(assVal);
  cgstVal = r2(cgstVal);
  sgstVal = r2(sgstVal);
  igstVal = r2(igstVal);
  const totInvVal = r2(assVal + cgstVal + sgstVal + igstVal + input.otherCharges - input.discountAmount + input.roundOff);

  const payload: Record<string, unknown> = {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: "INV",
      No: input.docNumber,
      Dt: ddmmyyyy(input.docDate),
    },
    SellerDtls: party(input.seller),
    BuyerDtls: party(input.buyer, { Pos: input.posStateCode }),
    ItemList: itemList,
    ValDtls: {
      AssVal: assVal,
      CgstVal: cgstVal,
      SgstVal: sgstVal,
      IgstVal: igstVal,
      CesVal: 0,
      StCesVal: 0,
      Discount: r2(input.discountAmount),
      OthChrg: r2(input.otherCharges),
      RndOffAmt: r2(input.roundOff),
      TotInvVal: totInvVal,
    },
  };

  if (input.eway && (input.eway.vehicleNumber || input.eway.transporterId)) {
    payload.EwbDtls = {
      ...(input.eway.transporterId ? { TransId: input.eway.transporterId } : {}),
      ...(input.eway.transporterName ? { TransName: input.eway.transporterName } : {}),
      ...(input.eway.distanceKm ? { Distance: Math.round(input.eway.distanceKm) } : {}),
      ...(input.eway.transportDocNo ? { TransDocNo: input.eway.transportDocNo } : {}),
      ...(input.eway.transportDocDate ? { TransDocDt: ddmmyyyy(input.eway.transportDocDate) } : {}),
      ...(input.eway.vehicleNumber ? { VehNo: input.eway.vehicleNumber } : {}),
      VehType: "R",
      TransMode: input.eway.transportMode || "1",
    };
  }

  return payload;
}

/** Deterministic-looking mock IRN/QR for when no NIC credentials are configured (test mode). */
export function buildMockIrnResponse(docNumber: string, gstin: string) {
  const seed = `${gstin}|${docNumber}|${Date.now()}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const irn = `MOCK${hash.toString(16).padStart(8, "0")}${"0".repeat(48)}`.slice(0, 64).toUpperCase();
  const now = new Date();
  return {
    Irn: irn,
    AckNo: `MOCKACK${hash}`,
    AckDt: now.toISOString(),
    SignedInvoice: `MOCK.SIGNED.INVOICE.${hash}`,
    SignedQRCode: `MOCK|Irn:${irn}|DocNo:${docNumber}|Gstin:${gstin}|TestMode:true`,
  };
}
