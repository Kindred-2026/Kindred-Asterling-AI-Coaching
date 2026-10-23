import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  INTERCOM_JWT_TTL_SECONDS,
  intercomConfig,
  signIntercomUserJwt,
} from "./intercom";

describe("intercomConfig", () => {
  it("needs both the app ID and the Messenger secret", () => {
    expect(intercomConfig({})).toBeNull();
    expect(intercomConfig({ INTERCOM_APP_ID: "app" })).toBeNull();
    expect(intercomConfig({ INTERCOM_MESSENGER_SECRET: "s" })).toBeNull();
    expect(
      intercomConfig({ INTERCOM_APP_ID: " app ", INTERCOM_MESSENGER_SECRET: " s " }),
    ).toEqual({ appId: "app", secret: "s" });
  });
});

describe("signIntercomUserJwt", () => {
  it("signs the user with HS256 and a short expiry", () => {
    const secret = crypto.randomBytes(32).toString("hex");
    const jwt = signIntercomUserJwt(
      { user_id: "user-1", email: "a@example.test", name: "Ada" },
      secret,
      1_000,
    );
    const [header, payload, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({
      alg: "HS256",
      typ: "JWT",
    });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      user_id: "user-1",
      email: "a@example.test",
      name: "Ada",
      exp: 1_000 + INTERCOM_JWT_TTL_SECONDS,
    });
    expect(signature).toBe(
      crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url"),
    );
  });
});
