import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

function keyByUserOrIp(req: Request): string {
  if (req.user?.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many requests, please try again later." },
  skip: (req) =>
    req.method === "GET" &&
    (req.path === "/api" ||
      req.path === "/api/" ||
      req.path.startsWith("/api/healthz")),
});

export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: { error: "Too many write requests, please slow down." },
});

// Chat is uniquely expensive: every /chat/send hits a third-party LLM with
// billable tokens, and even /chat/append grows the history that future sends
// re-bill. Hold chat to a much tighter per-user budget than generic writes so
// one account can't burn the Ollama quota or drive up cost.
export const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: keyByUserOrIp,
  message: {
    error:
      "You're sending messages to Kindred too quickly. Take a breath and try again in a few minutes.",
  },
});
