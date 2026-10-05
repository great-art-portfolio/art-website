/** CAD formatting. Prices are integer cents in the API and storage. */
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

/** "$140 CAD": the painting page and share text, where the currency
 * matters to a buyer outside Canada. Takes integer cents. */
export function formatPriceCAD(priceCents: number): string {
  return `${formatPriceShort(priceCents / 100)} CAD`;
}

/** Short price for gallery captions: "$140", "$1,250", or "$140.50" when
 * there are cents. Takes dollars, as painting frontmatter stores them. */
export function formatPriceShort(dollars: number): string {
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(dollars);
}
