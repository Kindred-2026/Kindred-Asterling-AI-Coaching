// Metadata-only tracing proxy in front of the Fly.io API server.
// Request/response bodies, headers and query strings are never attached to spans.
import { tracing } from "cloudflare:workers";

interface Env {
  ORIGIN: string;
}

function buildValidatedUrl(
  baseUrl: string,
  path: string,
  search: string
): string {
  try {
    if (path.includes("../") || /%2e%2e/i.test(path)) {
      throw new Error("Invalid path");
    }
    const url = new URL(baseUrl);
    // Assigning to pathname keeps the host fixed to the configured origin.
    url.pathname = path;
    url.search = search;
    return url.href;
  } catch {
    throw new Error("Invalid URL");
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    return tracing.enterSpan("proxy_request", async (span) => {
      span.setAttribute("http.request.method", request.method);
      span.setAttribute("url.path", url.pathname);

      const upstream = buildValidatedUrl(env.ORIGIN, url.pathname, url.search);
      const response = await fetch(new Request(upstream, request));

      span.setAttribute("http.response.status_code", response.status);
      return response;
    });
  },
};
