# AI provider data and privacy plan

**Status: target architecture; not evidence of a live provider cutover.** The
application keeps the existing OpenAI-compatible provider interface. The target
hosted route is OpenAI-compatible inference through Cloudflare AI Gateway, with
the model vendor and account selected after quality, privacy, and contract review.
Use `OPENAI_BASE_URL` for the Gateway endpoint and keep `OPENAI_API_KEY` only in
the runtime secret store. The application sends
`cf-aig-collect-log-payload: false` to disable Gateway payload logging; the
operator must also disable payload logging in Gateway settings. Keep AI Gateway
caching off for personalized coaching. `AI_PROVIDER=disabled` prevents requests
from leaving the application. Local Ollama remains a development option.

The Gateway routes requests; it does not include model inference in its free
feature tier. The selected upstream model provider bills inference separately.
Do not describe Cloudflare as the model processor until the actual Gateway and
upstream provider are configured and verified.

## Data that may be sent

Only data needed for the current coaching turn may be submitted:

- the bounded recent chat transcript and the current free-form message;
- preferred/first name, birthday, bio, motivational quote, struggles, strengths,
  and interests used by the coaching prompt;
- when the model explicitly invokes a tool, a bounded set of the user's recent
  morning logs, evening reports, body scans, habit/streak data, or today's
  medication schedule/status.

These fields can reveal health, mental-health, medication, and crisis information.
Do not add contact details, account identifiers, payment data, authentication data,
or records belonging to another user. Tool queries remain user-scoped and outputs
are size bounded.

The OpenAI-compatible request sets `store: false`. This requests no provider-side
storage where supported, but it is not a substitute for contractual controls and
does not make every compatible endpoint honor the option. The Gateway request
header only disables Gateway payload collection; it does not govern upstream
provider retention, abuse monitoring, or legal access.

## Production approval gate

Before enabling any hosted provider with production health-related information,
the organization must document privacy/security and legal review, including data
processing terms, retention and training terms, subprocessors and data residency,
incident handling, deletion, access controls, and whether an appropriate healthcare
agreement is required. Keep the hosted provider disabled until that review,
contract, payload logging configuration, spend alerts, and staging checks are
approved. Re-review before changing provider, model, base URL, fields, tools, or
provider account settings.
