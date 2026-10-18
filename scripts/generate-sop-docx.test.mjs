import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  OUTPUT,
  SOURCE,
  buildParts,
  parseBlocks,
  parseInline,
  slugify,
  staleParts,
  unzip,
  zip,
} from "./generate-sop-docx.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const SAMPLE = `# Title

Intro with \`code\` and **bold**.

## 1. First section

- one
  continued
- [ ] check me
  - nested

1. step
2. step

| A | B |
| --- | --- |
| x | \`y\` |

\`\`\`sh
echo "<hi>"
\`\`\`

> A note.
`;

test("parseBlocks reads each supported block", () => {
  const blocks = parseBlocks(SAMPLE);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading", "paragraph", "heading", "list", "list", "table", "code", "quote"],
  );
  const [bullets, numbers] = blocks.filter((block) => block.type === "list");
  assert.deepEqual(bullets.items, [
    { level: 0, ordered: false, checkbox: false, text: "one continued" },
    { level: 0, ordered: false, checkbox: true, text: "check me" },
    { level: 1, ordered: false, checkbox: false, text: "nested" },
  ]);
  assert.equal(numbers.ordered, true);
  assert.deepEqual(blocks[5], { type: "table", header: ["A", "B"], rows: [["x", "`y`"]] });
  assert.deepEqual(blocks[6], { type: "code", lines: ['echo "<hi>"'] });
});

test("parseInline keeps external links and names repository files", () => {
  assert.deepEqual(parseInline("[site](https://example.com) and [runbook](RUNBOOK.md#step)"), [
    { href: "https://example.com", text: "site" },
    { text: " and " },
    { text: "runbook" },
    { text: " (" },
    { text: "docs/RUNBOOK.md", code: true },
    { text: ")" },
  ]);
  assert.deepEqual(parseInline("[up](../README.md)").at(-2), { text: "README.md", code: true });
  assert.deepEqual(parseInline("[s](#9-verify)"), [{ anchor: "9-verify", text: "s" }]);
});

test("slugify matches GitHub heading anchors", () => {
  assert.equal(slugify("12. Maintaining this SOP"), "12-maintaining-this-sop");
  assert.equal(slugify("4. Proxy hops (`TRUST_PROXY_HOPS`)"), "4-proxy-hops-trust_proxy_hops");
});

test("the package is deterministic and round-trips through unzip", () => {
  const parts = buildParts(SAMPLE);
  const first = zip(parts);
  assert.ok(first.equals(zip(buildParts(SAMPLE))));
  const files = unzip(first);
  assert.deepEqual(
    [...files.keys()],
    parts.map(([name]) => name),
  );
  const document = files.get("word/document.xml").toString("utf8");
  assert.match(document, /echo &quot;&lt;hi&gt;&quot;/);
  assert.match(document, /<w:pStyle w:val="Title"\/>/);
  assert.deepEqual(staleParts(parts, first), []);
  assert.deepEqual(staleParts(buildParts(`${SAMPLE}\nMore.\n`), first), ["word/document.xml"]);
});

test("the committed Word copy matches the SOP source", () => {
  const parts = buildParts(readFileSync(`${ROOT}/${SOURCE}`, "utf8"));
  assert.deepEqual(staleParts(parts, readFileSync(`${ROOT}/${OUTPUT}`)), [], "run `pnpm docs:sop`");
});
