import { defineEventHandler } from "h3";

export default defineEventHandler(() => {
  const amount = Number(process.env.FLOW_AMOUNT_CLP || "1000");
  return {
    id: String(process.env.GOOGLE_ADS_ID || "").trim(),
    purchase: String(process.env.GOOGLE_ADS_PURCHASE_LABEL || "").trim(),
    checkout: String(process.env.GOOGLE_ADS_CHECKOUT_LABEL || "").trim(),
    amount: Number.isFinite(amount) && amount > 0 ? amount : 1000,
  };
});
