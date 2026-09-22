/// <reference types="vitest/globals" />
import { describe, it, expect } from "vitest";
import {
  classifyAuth0IdentityError,
  createAuth0ErrorResponse,
  IdentityLinkRequiredError,
  Auth0IdentitySyncFailed,
} from "./authMiddleware";
import { Auth0UserinfoRequestFailed, Auth0SubjectMismatch } from "../lib/auth0Profile";

describe("authMiddleware error classification", () => {
  it("classifies non-2xx /userinfo response as auth0_userinfo_request_failed", () => {
    const err = new Auth0UserinfoRequestFailed();
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(503);
    expect(errorCategory).toBe("auth0_userinfo_request_failed");
  });

  it("classifies thrown fetch failure as auth0_userinfo_request_failed", () => {
    const err = new Auth0UserinfoRequestFailed();
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(503);
    expect(errorCategory).toBe("auth0_userinfo_request_failed");
  });

  it("classifies profile sub mismatch as auth0_subject_mismatch", () => {
    const err = new Auth0SubjectMismatch();
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(503);
    expect(errorCategory).toBe("auth0_subject_mismatch");
  });

  it("classifies unknown identity-sync failure as auth0_identity_sync_failed", () => {
    const err = new Auth0IdentitySyncFailed();
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(503);
    expect(errorCategory).toBe("auth0_identity_sync_failed");
  });

  it("classifies generic unknown error as auth0_identity_sync_failed", () => {
    const err = new Error("some random error");
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(503);
    expect(errorCategory).toBe("auth0_identity_sync_failed");
  });

  it("IdentityLinkRequiredError remains separate 409 path", () => {
    const err = new IdentityLinkRequiredError();
    const { status, errorCategory } = classifyAuth0IdentityError(err);
    expect(status).toBe(409);
    expect(errorCategory).toBe("account_link_required");
  });
});

describe("authMiddleware error response shape", () => {
  it("non-2xx and thrown /userinfo produce generic 503 with no error details", () => {
    const err1 = new Auth0UserinfoRequestFailed();
    const { status: s1, body: b1 } = createAuth0ErrorResponse(err1);
    expect(s1).toBe(503);
    expect(b1).toEqual({ error: "Authentication temporarily unavailable" });

    const err2 = new Auth0SubjectMismatch();
    const { status: s2, body: b2 } = createAuth0ErrorResponse(err2);
    expect(s2).toBe(503);
    expect(b2).toEqual({ error: "Authentication temporarily unavailable" });
  });

  it("unknown identity-sync failure produces generic 503 with no error details", () => {
    const err = new Auth0IdentitySyncFailed();
    const { status, body } = createAuth0ErrorResponse(err);
    expect(status).toBe(503);
    expect(body).toEqual({ error: "Authentication temporarily unavailable" });
  });

  it("IdentityLinkRequiredError produces 409 with account_link_required error", () => {
    const err = new IdentityLinkRequiredError();
    const response = createAuth0ErrorResponse(err);
    // Assert the full expected 409 response object to satisfy TypeScript
    expect(response).toEqual({
      status: 409,
      body: {
        error: "account_link_required",
        message: "Your existing Kindred account needs to be linked. Contact support to retain your history.",
      },
    });
  });
});