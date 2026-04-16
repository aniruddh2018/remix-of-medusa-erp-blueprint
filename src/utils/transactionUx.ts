export type PaymentState = "paid" | "partial" | "unpaid";
export type ReceiveState = "received" | "partially_received" | "not_received";

export interface PaymentSummary {
  paid: number;
  balance: number;
  state: PaymentState;
}

export function getPaymentSummary(totalAmount: number, paidAmount: number): PaymentSummary {
  const normalizedTotal = Number(totalAmount) || 0;
  const normalizedPaid = Math.max(0, Number(paidAmount) || 0);
  const balance = Math.max(0, normalizedTotal - normalizedPaid);

  if (balance <= 0.01) {
    return { paid: normalizedPaid, balance: 0, state: "paid" };
  }

  if (normalizedPaid > 0) {
    return { paid: normalizedPaid, balance, state: "partial" };
  }

  return { paid: 0, balance, state: "unpaid" };
}

export function getReceiveState(orderStatus: string): ReceiveState {
  if (orderStatus === "delivered") return "received";
  if (orderStatus === "shipped") return "partially_received";
  return "not_received";
}
