// Currency + unit helpers. All stored prices are in RWF.

export const USD_TO_RWF = 1300; // simple internal conversion if USD is entered

export type UnitType = "kg" | "liters" | "pieces";

export const UNIT_OPTIONS: { value: UnitType; label: string; short: string }[] = [
  { value: "kg", label: "Kilograms (kg)", short: "kg" },
  { value: "liters", label: "Liters (L)", short: "L" },
  { value: "pieces", label: "Pieces (pcs)", short: "pcs" },
];

export const unitShort = (u?: string) =>
  UNIT_OPTIONS.find((o) => o.value === u)?.short ?? "";

const rwfFmt = new Intl.NumberFormat("en-RW", {
  style: "currency",
  currency: "RWF",
  maximumFractionDigits: 0,
});

export const formatRWF = (n: number) => rwfFmt.format(Math.round(Number(n) || 0));

export const toRWF = (amount: number, currency: "RWF" | "USD") =>
  currency === "USD" ? Number(amount) * USD_TO_RWF : Number(amount);

// Low-stock rule: threshold is 45% of total quantity added.
// Falls back to minQuantity if quantityAdded is missing.
export const LOW_STOCK_RATIO = 0.45;
export function lowStockThreshold(item: { quantityAdded?: number; minQuantity?: number }): number {
  const added = Number(item.quantityAdded ?? 0);
  if (added > 0) return added * LOW_STOCK_RATIO;
  return Number(item.minQuantity ?? 0);
}
export function isLowStock(item: { quantity: number; quantityAdded?: number; minQuantity?: number }): boolean {
  return Number(item.quantity) <= lowStockThreshold(item);
}
