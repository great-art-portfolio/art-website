import { flag, type AppEnv } from "./env";

/**
 * Shippo, disabled by default. To enable later:
 *   1. Create a Shippo account (no monthly fee, pay per label).
 *   2. Set ENABLE_SHIPPO="true" and SHIPPO_API_TOKEN in Cloudflare.
 * Until then the admin portal links out to Chit Chats / Pirate Ship,
 * which is the cheapest way to mail art from Calgary.
 */

export interface ShippoAddress {
  name: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  email?: string;
}

export interface ShippoQuote {
  enabled: boolean;
  rates?: unknown;
}

export interface ShippoLabel {
  enabled: boolean;
  labelUrl?: string;
  trackingNumber?: string;
}

function auth(env: AppEnv): string {
  if (env.SHIPPO_API_TOKEN === undefined || env.SHIPPO_API_TOKEN === "") {
    throw new Error("ENABLE_SHIPPO is true but SHIPPO_API_TOKEN is missing");
  }
  return `ShippoToken ${env.SHIPPO_API_TOKEN}`;
}

export async function fetchShippoRates(
  env: AppEnv,
  input: { to: ShippoAddress; weightLb: number },
): Promise<ShippoQuote> {
  if (!flag(env.ENABLE_SHIPPO)) return { enabled: false };
  const res = await fetch("https://api.goshippo.com/shipments/", {
    method: "POST",
    headers: { Authorization: auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      address_to: input.to,
      // Uses the Shippo test "from" address until a sender profile is added.
      address_from: {
        name: "Gallery",
        street1: "Calgary AB",
        city: "Calgary",
        state: "AB",
        zip: "T2P 0A1",
        country: "CA",
      },
      parcels: [{ length: "18", width: "14", height: "4", distance_unit: "in", weight: String(input.weightLb), mass_unit: "lb" }],
      async: false,
    }),
  });
  if (!res.ok) throw new Error(`Shippo error: ${await res.text()}`);
  const data = (await res.json()) as { rates: unknown };
  return { enabled: true, rates: data.rates };
}

export async function buyShippoLabel(
  env: AppEnv,
  input: { rateId: string },
): Promise<ShippoLabel> {
  if (!flag(env.ENABLE_SHIPPO)) return { enabled: false };
  const res = await fetch("https://api.goshippo.com/transactions/", {
    method: "POST",
    headers: { Authorization: auth(env), "Content-Type": "application/json" },
    body: JSON.stringify({ rate: input.rateId, label_file_type: "PDF", async: false }),
  });
  if (!res.ok) throw new Error(`Shippo error: ${await res.text()}`);
  const data = (await res.json()) as { label_url: string; tracking_number: string };
  return { enabled: true, labelUrl: data.label_url, trackingNumber: data.tracking_number };
}
