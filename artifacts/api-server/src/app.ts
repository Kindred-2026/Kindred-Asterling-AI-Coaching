import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authMiddleware } from "./middlewares/authMiddleware";
import { testClerkIdentityAdapter } from "./middlewares/testClerkIdentityAdapter";
import { generalLimiter, writeLimiter } from "./middlewares/rateLimiter";
import { securityHeaders } from "./middlewares/securityHeaders";
import router from "./routes";
import healthRouter from "./routes/health";
import { logger } from "./lib/logger";

const app: Express = express();

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const auth0Origins = process.env.AUTH0_DOMAIN
  ? [`https://${process.env.AUTH0_DOMAIN.trim()}`]
  : [];

// Security headers go first so every response, health checks included,
// carries HSTS and the rest.
app.use(securityHeaders(auth0Origins));

// Health routes must respond without Auth0 credentials (used in CI/verification
// environments where Auth0 values may not be configured).
app.use("/api", healthRouter);

const allowedOrigins = new Set(
  [
    process.env.APP_PUBLIC_URL,
    process.env.APP_PUBLIC_URL?.replace("://", "://www."),
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]
    .filter((origin): origin is string => Boolean(origin))
    .map((origin) => origin.replace(/\/$/, "")),
);

const trustedProxyHops = Number.parseInt(
  process.env.TRUST_PROXY_HOPS ?? "1",
  10,
);
app.set(
  "trust proxy",
  Number.isFinite(trustedProxyHops) ? trustedProxyHops : 1,
);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, server-to-server)
      // and any localhost origin (for local dev on any port).
      if (
        !origin ||
        allowedOrigins.has(origin.replace(/\/$/, "")) ||
        /^https?:\/\/localhost(:\d+)?$/i.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
  }),
);
app.use(
  express.json({
    limit: "32kb",
    verify: (req, _res, buf) => {
      // Preserve the raw body so the Helcim webhook route can verify its HMAC
      // signature over the exact bytes Helcim sent.
      (req as unknown as { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

// Tests use a deliberately small application identity stand-in, never production session code.
if (isTest) {
  app.use(testClerkIdentityAdapter);
} else {
  app.use(authMiddleware);
}

app.use(generalLimiter);

app.use((req, res, next) => {
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (writeMethods.includes(req.method)) {
    writeLimiter(req, res, next);
  } else {
    next();
  }
});

// Password reset — must be accessible without auth; placed before the main
// router to avoid hitting requireAuth inside the router stack.
app.use("/api", router);

if (process.env.NODE_ENV === "production") {
  const serverDir = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.resolve(serverDir, "../../kindred-coach/dist/public");

  app.use(express.static(publicDir));
  app.get(/^(?!\/api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

export default app;
