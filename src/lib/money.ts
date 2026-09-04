/** CAD formatting. Prices are integer cents everywhere (API, D1). */
export function formatCAD(priceCents: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(priceCents / 100);
}

export function dollarsToCents(dollars: number): number | null {
  if (!Number.isFinite(dollars) || dollars <= 0) return null;
  return Math.round(dollars * 100);
}
