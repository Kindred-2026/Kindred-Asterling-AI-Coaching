import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import path from "path";

// PORT and BASE_PATH are set by the dev/preview workflow. A `vite build`
// during the monorepo production build runs without that workflow context,
// so enforce them only for `serve`/`preview` and fall back to safe values
// during `build`. The deployment serves this app at "/", so "/" is the
// correct production base.
const rawPort = process.env.PORT;
const basePath = process.env.BASE_PATH;
// Local development only: the dev launcher injects KINDRED_API_ORIGIN so the
// Vite dev server proxies same-origin /api requests to the Express API.
const apiProxyTarget =
  process.env.KINDRED_API_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig(({ command, mode }) => {
  const isServe = command === "serve";

  if (isServe) {
    if (!rawPort) {
      throw new Error(
        "PORT environment variable is required but was not provided.",
      );
    }
    const parsed = Number(rawPort);
    if (Number.isNaN(parsed) || parsed <= 0) {
      throw new Error(`Invalid PORT value: "${rawPort}"`);
    }
    if (!basePath) {
      throw new Error(
        "BASE_PATH environment variable is required but was not provided.",
      );
    }
  }

  const port = rawPort ? Number(rawPort) : 5173;
  const resolvedBase = basePath ?? "/";

  // Onboarding writes this package's Auth0 public configuration locally.
  // Other environment variables keep the existing workspace-root precedence.
  const auth0Env = loadEnv(mode, import.meta.dirname, "VITE_AUTH0_");

  // Deployment builds with a Sentry auth token upload source maps so browser
  // errors show the original code, then delete the maps so they are never
  // served. Without the token (local, CI) no maps are made.
  const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
  const sentryPlugins = sentryAuthToken
    ? [
        sentryVitePlugin({
          org: "kindred-asterling-ai",
          project: "4512266373038080",
          authToken: sentryAuthToken,
          telemetry: false,
          sourcemaps: {
            filesToDeleteAfterUpload: ["./dist/public/**/*.map"],
          },
        }),
      ]
    : [];

  return {
    define: Object.fromEntries(
      Object.entries(auth0Env).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(process.env[key] ?? value),
      ]),
    ),
    base: resolvedBase,
    plugins: [react(), tailwindcss(), ...sentryPlugins],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
        "@assets": path.resolve(
          import.meta.dirname,
          "..",
          "..",
          "attached_assets",
        ),
        "use-sync-external-store/shim/index.js": path.resolve(
          import.meta.dirname,
          "src/shims/use-sync-external-store-shim.js",
        ),
      },
      dedupe: ["react", "react-dom", "@tanstack/react-query"],
    },
    root: path.resolve(import.meta.dirname),
    envDir: path.resolve(import.meta.dirname, "..", ".."),
    build: {
      sourcemap: sentryAuthToken ? "hidden" : false,
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
    },
    server: {
      port,
      strictPort: true,
      host: "0.0.0.0",
      allowedHosts: true,
      fs: {
        strict: true,
      },
      // Dev-server-only: forward /api to Express so the browser stays on one
      // origin (keeps the Auth0 callback and CORS simple). Never applied to
      // `vite build` or preview.
      proxy: {
        "/api": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port,
      host: "0.0.0.0",
      allowedHosts: true,
    },
  };
});
