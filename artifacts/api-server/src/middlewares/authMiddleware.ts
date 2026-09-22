import { auth } from "express-oauth2-jwt-bearer";
import type { NextFunction, Request, Response, RequestHandler } from "express";
import { logger } from "../lib/logger";
import { createAuth0ProfileLoader } from "../lib/auth0Profile";
import {
  IdentityLinkRequiredError,
  syncAuth0Identity,
  type AuthIdentity,
} from "../lib/auth0Identity";
import {
  Auth0UserinfoRequestFailed,
  Auth0SubjectMismatch,
} from "../lib/auth0Profile";

export { IdentityLinkRequiredError } from "../lib/auth0Identity";

export class Auth0IdentitySyncFailed extends Error {
  readonly category = "auth0_identity_sync_failed" as const;
  constructor() {
    super("Auth0 identity synchronization failed");
    this.name = "Auth0IdentitySyncFailed";
  }
}

export function classifyAuth0IdentityError(err: unknown): {
  status: number;
  errorCategory: string;
} {
  if (err instanceof IdentityLinkRequiredError) {
    return { status: 409, errorCategory: "account_link_required" };
  }
  if (err instanceof Auth0UserinfoRequestFailed) {
    return { status: 503, errorCategory: "auth0_userinfo_request_failed" };
  }
  if (err instanceof Auth0SubjectMismatch) {
    return { status: 503, errorCategory: "auth0_subject_mismatch" };
  }
  return { status: 503, errorCategory: "auth0_identity_sync_failed" };
}

type ErrorResponseBody =
  | { error: "account_link_required"; message: string }
  | { error: "Authentication temporarily unavailable" };

export function createAuth0ErrorResponse(err: unknown): {
  status: number;
  body: ErrorResponseBody;
} {
  const { status, errorCategory } = classifyAuth0IdentityError(err);
  if (errorCategory === "account_link_required") {
    return {
      status: 409,
      body: {
        error: "account_link_required",
        message:
          "Your existing Kindred account needs to be linked. Contact support to retain your history.",
      },
    };
  }
  logger.warn({ errorCategory }, "Auth0 identity resolution failed");
  return {
    status: 503,
    body: { error: "Authentication temporarily unavailable" },
  };
}

declare global {
  namespace Express {
    interface User extends AuthIdentity {}
    interface Request {
      isAuthenticated(): this is AuthedRequest;
      user?: User;
    }
    interface AuthedRequest {
      user: User;
    }
  }
}

export function createAuth0Middleware(options: {
  issuerBaseURL: string;
  audience: string;
  profileFetch?: typeof fetch;
  syncIdentity?: typeof syncAuth0Identity;
}): RequestHandler {
  const checkToken = auth({
    issuerBaseURL: options.issuerBaseURL,
    audience: options.audience,
    tokenSigningAlg: "RS256",
  });
  const loadProfile = createAuth0ProfileLoader(options);
  return (req, res, next) => {
    req.isAuthenticated = function (this: Request) {
      return this.user != null;
    } as Request["isAuthenticated"];
    if (!req.headers.authorization) return next();
    checkToken(req, res, (err?: unknown) => {
      if (
        err ||
        typeof req.auth?.payload.sub !== "string" ||
        req.auth.payload.sub.endsWith("@clients")
      ) {
        res
          .status(401)
          .set("WWW-Authenticate", 'Bearer error="invalid_token"')
          .json({ error: "Unauthorized" });
        return;
      }
      void resolveIdentity(req, res, next, options, loadProfile);
    });
  };
}
let productionMiddleware: RequestHandler | undefined;
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];
  if (!req.headers.authorization) return next();
  const domain = process.env.AUTH0_DOMAIN?.trim();
  const audience = process.env.AUTH0_AUDIENCE?.trim();
  if (!domain || !audience) {
    res.status(503).json({ error: "Authentication is not configured" });
    return;
  }
  productionMiddleware ??= createAuth0Middleware({
    issuerBaseURL: `https://${domain}/`,
    audience,
  });
  return productionMiddleware(req, res, next);
}

async function resolveIdentity(
  req: Request,
  res: Response,
  next: NextFunction,
  options: Parameters<typeof createAuth0Middleware>[0],
  loadProfile: ReturnType<typeof createAuth0ProfileLoader>,
) {
  try {
    const identity = await loadProfile(
      req.auth!.token,
      req.auth!.payload.sub!,
      typeof req.auth!.payload.exp === "number"
        ? req.auth!.payload.exp * 1000
        : 0,
    );
    const user = await (options.syncIdentity ?? syncAuth0Identity)(identity);
    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
      emailVerified: user.emailVerifiedAt != null,
    };
    next();
  } catch (err) {
    const { status, body } = createAuth0ErrorResponse(err);
    res.status(status).json(body);
  }
}