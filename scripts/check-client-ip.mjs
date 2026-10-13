// `node scripts/check-client-ip.mjs https://<app>.ondigitalocean.app`
//
// Checks that the deployed app's rate limiter sees this machine's real IP
// address, which tells whether TRUST_PROXY_HOPS matches the proxies in front
// of the app. Signed-out requests are rate limited per IP, and the limiter's
// `RateLimit-Policy` header carries a hash of the key it used (`pk`). If
// TRUST_PROXY_HOPS is too low, the app sees a proxy's address and every
// visitor shares one limit; if it is too high, anyone can pick their own
// limit by sending a forged X-Forwarded-For header.
//
// Sends two unauthenticated requests over IPv4. Prints hashes, never IPs.

import { createHash } from "node:crypto";
import { request } from "node:https";
import { pathToFileURL } from "node:url";

const FORGED_IP = "192.0.2.1"; // TEST-NET-1, never a real visitor

// Mirrors express-rate-limit's partition key for the app's `ip:` keys.
export function partitionKey(ip) {
  const hex = createHash("sha256").update(`ip:${ip}`).digest("hex").slice(0, 12);
  return Buffer.from(hex).toString("base64");
}

export function headerPartitionKey(policy) {
  return /;\s*pk=:([^:]+):/.exec(policy ?? "")?.[1] ?? null;
}

export function diagnose({ ownKey, plainKey, forgedKey }) {
  if (!plainKey || !forgedKey) {
    return "The response has no RateLimit-Policy partition key, so the check could not run.";
  }
  if (plainKey !== ownKey) {
    return "The app does not see this machine's IP address, so every visitor would share one rate limit. Raise TRUST_PROXY_HOPS by one in .do/app.yaml and deploy again.";
  }
  if (forgedKey !== ownKey) {
    return "The app trusts a forged X-Forwarded-For header, so visitors could dodge rate limits. Lower TRUST_PROXY_HOPS by one in .do/app.yaml and deploy again.";
  }
  return null;
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, { family: 4, headers, timeout: 15_000 }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on("timeout", () => req.destroy(new Error(`timed out requesting ${new URL(url).host}`)));
    req.on("error", reject);
    req.end();
  });
}

async function main([base]) {
  if (!base) throw new Error("usage: check-client-ip.mjs <app URL>");
  const publicIp = async () => (await get("https://checkip.amazonaws.com")).body.trim();
  const own = await publicIp();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(own))
    throw new Error("could not find this machine's public IPv4 address");
  // Any rate-limited, uncached path works; signed out, this one answers 401.
  const target = new URL(`/api/auth/user?client-ip-check=${Date.now()}`, base).href;
  const plain = await get(target);
  const forged = await get(target, { "x-forwarded-for": FORGED_IP });
  if ((await publicIp()) !== own) {
    throw new Error(
      "This machine's public IP changed during the check, so it cannot decide. Run it again.",
    );
  }
  const keys = {
    ownKey: partitionKey(own),
    plainKey: headerPartitionKey(plain.headers["ratelimit-policy"]),
    forgedKey: headerPartitionKey(forged.headers["ratelimit-policy"]),
  };
  console.log(
    `expected pk=${keys.ownKey}, plain request pk=${keys.plainKey}, forged-header request pk=${keys.forgedKey}`,
  );
  const problem = diagnose(keys);
  if (problem) throw new Error(problem);
  console.log(
    "Rate limits see the real visitor IP: TRUST_PROXY_HOPS is right for this deployment.",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
