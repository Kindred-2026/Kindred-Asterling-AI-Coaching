import { generateKeyPairSync, sign } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createAuth0Middleware } from "../middlewares/authMiddleware";
import { IdentityLinkRequiredError } from "./auth0Identity";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const audience = "https://kindred.test/api";
let issuer: string;
let server: Server;
const syncIdentity = vi.fn();
const profileFetch = vi.fn();
let app: ReturnType<typeof express>;
function token(claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-key" }),
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: audience,
      sub: "auth0|user-1",
      iat: now,
      exp: now + 300,
      ...claims,
    }),
  ).toString("base64url");
  const input = `${header}.${body}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}
beforeAll(async () => {
  const discovery = express();
  discovery.disable("x-powered-by");
  discovery.get("/.well-known/openid-configuration", (_req, res) =>
    res.json({
      issuer,
      jwks_uri: `${issuer}.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ["RS256"],
    }),
  );
  discovery.get("/.well-known/jwks.json", (_req, res) =>
    res.json({
      keys: [
        {
          ...publicKey.export({ format: "jwk" }),
          kid: "test-key",
          alg: "RS256",
          use: "sig",
        },
      ],
    }),
  );
  server = await new Promise<Server>((resolve) => {
    const running = discovery.listen(0, "127.0.0.1", () => resolve(running));
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  issuer = `http://127.0.0.1:${address.port}/`;
});
function createTestApp() {
  app = express();
  app.disable("x-powered-by");
  app.use(
    createAuth0Middleware({
      issuerBaseURL: issuer,
      audience,
      syncIdentity,
      profileFetch,
    }),
  );
  app.get("/public", (_req, res) => res.sendStatus(200));
  app.get("/private", (req, res) =>
    req.isAuthenticated()
      ? res.json({ id: req.user!.id })
      : res.sendStatus(401),
  );
}
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});
beforeEach(() => {
  vi.clearAllMocks();
  createTestApp();
  profileFetch.mockResolvedValue(
    new Response(
      JSON.stringify({
        sub: "auth0|user-1",
        email: "person@example.test",
        email_verified: true,
      }),
      { status: 200 },
    ),
  );
  syncIdentity.mockResolvedValue({
    id: "stable-kindred-id",
    email: "person@example.test",
    firstName: null,
    lastName: null,
    profileImageUrl: null,
    emailVerifiedAt: new Date(),
  });
});
describe("Auth0 API authentication", () => {
  it("keeps public routes open while protecting user routes", async () => {
    expect((await request(app).get("/public")).status).toBe(200);
    expect((await request(app).get("/private")).status).toBe(401);
    expect(profileFetch).not.toHaveBeenCalled();
  });
  it("validates a signed access token and uses the stable application identity", async () => {
    const response = await request(app)
      .get("/private")
      .auth(token(), { type: "bearer" });
    expect(response.status).toBe(200);
    expect(response.body.id).toBe("stable-kindred-id");
    expect(syncIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auth0|user-1", emailVerified: true }),
    );
  });
  it.each([
    ["wrong issuer", { iss: "https://attacker.invalid/" }],
    ["wrong audience", { aud: "other-api" }],
    ["ID token audience", { aud: "spa-client-id" }],
    ["expired token", { exp: 1 }],
    ["missing subject", { sub: undefined }],
    ["machine identity", { sub: "client@clients" }],
  ])("rejects %s before fetching a profile", async (_name, claims) => {
    expect(
      (
        await request(app)
          .get("/private")
          .auth(token(claims), { type: "bearer" })
      ).status,
    ).toBe(401);
    expect(profileFetch).not.toHaveBeenCalled();
    expect(syncIdentity).not.toHaveBeenCalled();
  });
  it("rejects a forged signature", async () => {
    const signed = token().split(".");
    signed[2] = Buffer.alloc(256).toString("base64url");
    expect(
      (
        await request(app)
          .get("/private")
          .auth(signed.join("."), { type: "bearer" })
      ).status,
    ).toBe(401);
    expect(syncIdentity).not.toHaveBeenCalled();
  });
  it("rejects a profile belonging to another subject", async () => {
    profileFetch.mockResolvedValue(
      new Response(JSON.stringify({ sub: "auth0|other" })),
    );
    expect(
      (await request(app).get("/private").auth(token(), { type: "bearer" }))
        .status,
    ).toBe(503);
    expect(syncIdentity).not.toHaveBeenCalled();
  });
  it("shares UserInfo for repeated requests but rechecks application identity", async () => {
    const bearer = token();
    expect(
      (await request(app).get("/private").auth(bearer, { type: "bearer" }))
        .status,
    ).toBe(200);
    syncIdentity.mockRejectedValueOnce(new IdentityLinkRequiredError());
    expect(
      (await request(app).get("/private").auth(bearer, { type: "bearer" }))
        .status,
    ).toBe(409);
    expect(profileFetch).toHaveBeenCalledTimes(1);
    expect(syncIdentity).toHaveBeenCalledTimes(2);
    expect(
      (
        await request(app)
          .get("/private")
          .auth(token({ exp: 1 }), { type: "bearer" })
      ).status,
    ).toBe(401);
    expect(syncIdentity).toHaveBeenCalledTimes(2);
  });
  it("returns an actionable conflict when the existing account needs migration", async () => {
    syncIdentity.mockRejectedValueOnce(new IdentityLinkRequiredError());
    const response = await request(app)
      .get("/private")
      .auth(token(), { type: "bearer" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("account_link_required");
  });
});
