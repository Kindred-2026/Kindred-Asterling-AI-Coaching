// Metadata-only tracing proxy in front of the Fly.io API server.
// Request/response bodies, headers and query strings are never attached to spans.
import { tracing } from "cloudflare:workers";

interface Env {
  ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    return tracing.enterSpan("proxy_request", async (span) => {
      span.setAttribute("http.request.method", request.method);
      span.setAttribute("url.path", url.pathname);

      const upstream = new URL(url.pathname + url.search, env.ORIGIN);
      const response = await fetch(new Request(upstream, request));

      span.setAttribute("http.response.status_code", response.status);
      return response;
    });
  },
};
