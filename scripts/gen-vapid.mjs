/**
 * Generates a VAPID keypair for Web Push. Run once, locally:
 *
 *   node scripts/gen-vapid.mjs
 *
 * Put VAPID_PUBLIC_KEY + VAPID_CONTACT in Cloudflare as plain vars,
 * VAPID_PRIVATE_JWK in as a secret. The contact should be a real address
 * (push services use it to reach the sender about abuse).
 */
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });

const raw = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x ?? "", "base64url"),
  Buffer.from(jwk.y ?? "", "base64url"),
]);

console.log(`VAPID_PUBLIC_KEY=${raw.toString("base64url")}`);
console.log(
  `VAPID_PRIVATE_JWK=${JSON.stringify({ kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, d: jwk.d })}`,
);
console.log("VAPID_CONTACT=mailto:you@example.com");
