import { init } from "@amplitude/analytics-node";
import { logger } from "../lib/logger";

const key = process.env["AMPLITUDE_API_KEY"];
if (!key) {
  logger.error("[amplitude] AMPLITUDE_API_KEY is not set - no events will be sent");
} else {
  init(key, { serverZone: "US" });
}
