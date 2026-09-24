# AI Use Disclosure

**Status:** Approved — not legal advice
**Last repository review:** August 24, 2026
**Intended users:** Adults aged 18 and older only

This draft must be reconciled with the deployed infrastructure, contracts, business practices, supported launch locations, and applicable law. Confirmation items require approval by the proprietor, an authorized adult, and qualified legal counsel before publication.

## Where AI is used

AI generates coaching-chat replies and may help form summaries or contextual guidance. The server can provide recent morning and evening assessments, body scans, habit information, medication status, profile details, and a title-free calendar-load signal when those sources are relevant to the current message.

## Context minimization

Kindred's context assembler selects source categories using the current interaction instead of injecting all stored data into every conversation. Retrieval is scoped to the signed-in user and bounded by item and character limits.

## Limitations

- AI output is probabilistic and may be inaccurate, incomplete, inconsistent, or inappropriate.
- Calendar-load categories describe scheduling density only. They are not diagnoses or psychological conclusions.
- Kindred does not have human feelings, professional credentials, or independent knowledge of facts outside the information and tools supplied to it.
- Important health, legal, financial, safety, or other consequential information requires a qualified human source.

## Providers and data use

The production AI provider and its processing region must be confirmed against the live deployment before publication. The application supports local Ollama and an OpenAI-compatible hosted endpoint. The planned hosted route is Cloudflare AI Gateway to a selected upstream model provider; this is a target architecture, not confirmation that either service currently processes production data.

> **Founder/legal confirmation required:** Before publication, confirm the live model vendor, model, processing regions, retention, abuse monitoring, training policy, human-review access, and opt-out or consent choices. Confirm the Gateway payload logging configuration and the upstream provider's controls.

## Canadian privacy guidance

Review this disclosure against the [Canadian privacy regulators' principles for generative AI](https://www.priv.gc.ca/en/privacy-topics/technology/artificial-intelligence/gd_principles_ai), including meaningful consent, appropriate purposes, openness, safeguards, and limits on retention and secondary use.
