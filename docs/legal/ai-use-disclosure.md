# AI Use Disclosure

> **Superseded working draft.** The published text is in `artifacts/kindred-coach/src/pages/public/legal.tsx` (version 1.5, effective October 24, 2026), with matching PDFs in `artifacts/kindred-coach/public/legal-documents/`. This file is kept for history; where it differs from the published text, the published text applies.

**Status:** Approved — not legal advice
**Last repository review:** October 5, 2026
**Intended users:** Adults aged 18 and older only

This draft must be reconciled with the deployed infrastructure, contracts, business practices, supported launch locations, and applicable law. Confirmation items require approval by the proprietor, an authorized adult, and qualified legal counsel before publication.

## Where AI is used

AI generates coaching-chat replies and may help form summaries or contextual guidance. The server can provide recent morning and evening assessments, body scans, habit information, medication status, and profile details when those sources are relevant to the current message.

## Context minimization

Kindred's context assembler selects source categories using the current interaction instead of injecting all stored data into every conversation. Retrieval is scoped to the signed-in user and bounded by item and character limits.

## Limitations

- AI output is probabilistic and may be inaccurate, incomplete, inconsistent, or inappropriate.
- Kindred does not have human feelings, professional credentials, or independent knowledge of facts outside the information and tools supplied to it.
- Important health, legal, financial, safety, or other consequential information requires a qualified human source.

## Providers and data use

The deployed configuration (`fly.toml`, and `.do/app.yaml` after the DigitalOcean move) selects Anthropic's Claude models through the Anthropic API, processed in the United States. Requests can optionally be routed through Cloudflare AI Gateway; when they are, Kindred sends `cf-aig-collect-log-payload: false` and `cf-aig-skip-cache: true`. The application also supports an OpenAI-compatible endpoint and local Ollama, which are not selected for the hosted service.

> **Founder/legal confirmation required:** Before publication, confirm the live model vendor, model, processing regions, retention, abuse monitoring, training policy, human-review access, and opt-out or consent choices. Confirm the Gateway payload logging configuration and the upstream provider's controls.

## Canadian privacy guidance

Review this disclosure against the [Canadian privacy regulators' principles for generative AI](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai), including meaningful consent, appropriate purposes, openness, safeguards, and limits on retention and secondary use.
