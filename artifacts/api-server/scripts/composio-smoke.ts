// Read-only end-to-end check of the Composio integration: creates a session
// for one Kindred user, links GitHub if needed, and fetches that user's GitHub
// profile. Run from artifacts/api-server:
//   node --env-file=../../.env.local scripts/composio-smoke.ts <kindred-user-id>
import { createComposioSession } from "../src/lib/composio.ts";

const userId = process.argv[2]?.trim();
if (!userId) {
  console.error("usage: composio-smoke.ts <kindred-user-id>");
  process.exit(1);
}

const session = await createComposioSession(userId);
if (!session) {
  console.error("COMPOSIO_API_KEY is not set");
  process.exit(1);
}

const { items } = await session.toolkits();
const github = items.find((t) => t.slug === "github");
if (!github?.connection?.isActive) {
  const request = await session.authorize("github");
  console.log(`Connect GitHub for ${userId}:\n  ${request.redirectUrl}`);
  console.log("Waiting up to 5 minutes for the connection…");
  await request.waitForConnection(5 * 60_000);
}

const result = await session.execute("GITHUB_GET_THE_AUTHENTICATED_USER", {});
const data = (result.data as { data?: Record<string, unknown> }).data ??
  result.data;
console.log(
  JSON.stringify(
    {
      resultType: result.resultType,
      logId: result.logId,
      error: result.error,
      login: data.login,
      name: data.name,
      publicRepos: data.public_repos,
    },
    null,
    2,
  ),
);
process.exit(result.resultType === "completed" ? 0 : 1);
