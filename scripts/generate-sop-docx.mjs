// `pnpm docs:sop` / `pnpm docs:sop:check` — Word copy of the workflow SOP.
//
// Converts docs/WORKFLOW_SOP.md into docs/Kindred-Asterling-Workflow-SOP.docx.
// The Markdown file is the source; the .docx is generated and committed next
// to it. No dependencies: the document parts are written as WordprocessingML
// and packed with node:zlib. The output has no dates and fixed ZIP timestamps,
// so the same Markdown always gives the same document. `--check` compares the
// committed .docx with a fresh build and fails if it is out of date.
//
// Supported Markdown (the subset the SOP uses): `#` to `####` headings,
// paragraphs, `-` / `1.` lists with one nested level, `- [ ]` checkboxes,
// pipe tables, fenced code blocks, `>` block quotes, inline code, **bold**
// and links. External links stay links, `#anchor` links point at the matching
// heading, and links to other repository files are printed as their path.
//
// Usage: node scripts/generate-sop-docx.mjs [--check] [source.md] [output.docx]

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SOURCE = "docs/WORKFLOW_SOP.md";
export const OUTPUT = "docs/Kindred-Asterling-Workflow-SOP.docx";
const CODE_FONT = "Courier New";
const FOOTER_TEXT = "Kindred Asterling · Repository workflow SOP";

// US Letter with 1-inch margins, in twentieths of a point.
const PAGE = { width: 12240, height: 15840, margin: 1440 };
const TEXT_WIDTH = PAGE.width - 2 * PAGE.margin;

const COLORS = {
  ink: "1A1A2E",
  heading: "2E3A59",
  muted: "5F6675",
  rule: "C9CEDA",
  tableHeader: "E8EBF2",
  codeFill: "F4F5F8",
  noteFill: "EEF1F8",
  noteBar: "5B6C9A",
  link: "2F5FB3",
};

// ---------------------------------------------------------------------------
// Markdown blocks

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
const TABLE_SEPARATOR = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

function startsBlock(line, next) {
  return (
    /^#{1,6}\s/.test(line) ||
    /^\s*```/.test(line) ||
    /^>/.test(line) ||
    LIST_ITEM.test(line) ||
    (line.startsWith("|") && TABLE_SEPARATOR.test(next ?? ""))
  );
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseBlocks(markdown) {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i += 1;
      continue;
    }

    const fence = line.match(/^(\s*)```/);
    if (fence) {
      const indent = fence[1].length;
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        code.push(lines[i].slice(Math.min(indent, lines[i].search(/\S|$/))));
        i += 1;
      }
      blocks.push({ type: "code", lines: code });
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      i += 1;
      continue;
    }

    if (line.startsWith("|") && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
      const header = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", header, rows });
      continue;
    }

    if (line.startsWith(">")) {
      const text = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        text.push(lines[i].replace(/^>\s?/, "").trim());
        i += 1;
      }
      blocks.push({ type: "quote", text: text.join(" ").trim() });
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items = [];
      while (i < lines.length && lines[i].trim() !== "") {
        const item = lines[i].match(LIST_ITEM);
        if (item) {
          const checkbox = item[3].match(/^\[( |x|X)\]\s+(.*)$/);
          items.push({
            level: item[1].length >= 2 ? 1 : 0,
            ordered: /^\d/.test(item[2]),
            checkbox: Boolean(checkbox),
            text: checkbox ? checkbox[2] : item[3],
          });
        } else if (startsBlock(lines[i], lines[i + 1])) {
          break;
        } else {
          items[items.length - 1].text += ` ${lines[i].trim()}`;
        }
        i += 1;
      }
      blocks.push({ type: "list", ordered: items[0].ordered, items });
      continue;
    }

    const text = [line.trim()];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !startsBlock(lines[i], lines[i + 1])) {
      text.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ type: "paragraph", text: text.join(" ") });
  }
  return blocks;
}

// GitHub's heading anchors: lower case, punctuation dropped, spaces to hyphens.
export function slugify(text) {
  return text
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- _]/gu, "")
    .replace(/ /g, "-");
}

// ---------------------------------------------------------------------------
// Inline Markdown

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

// Returns runs of { text, bold, code, href?, anchor? }.
export function parseInline(text, inherited = {}, sourceDir = "docs") {
  const runs = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) runs.push({ ...inherited, text: text.slice(last, match.index) });
    if (match[1] !== undefined) {
      runs.push({ ...inherited, text: match[1], code: true });
    } else if (match[2] !== undefined) {
      runs.push(...parseInline(match[2], { ...inherited, bold: true }, sourceDir));
    } else {
      const [, , , label, target] = match;
      if (/^https?:\/\//.test(target)) {
        runs.push(...parseInline(label, { ...inherited, href: target }, sourceDir));
      } else if (target.startsWith("#")) {
        runs.push(...parseInline(label, { ...inherited, anchor: target.slice(1) }, sourceDir));
      } else {
        // A repository file has no meaning inside a Word document, so name it.
        const file = path.posix.normalize(path.posix.join(sourceDir, target.split("#")[0]));
        runs.push(...parseInline(label, inherited, sourceDir));
        runs.push({ ...inherited, text: " (" });
        runs.push({ ...inherited, text: file, code: true });
        runs.push({ ...inherited, text: ")" });
      }
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) runs.push({ ...inherited, text: text.slice(last) });
  return runs.filter((run) => run.text !== "");
}

// ---------------------------------------------------------------------------
// WordprocessingML

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

function esc(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textRun(text, rPr = "") {
  return `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function paragraph(content, { style, keepNext, numId, ilvl = 0, spacingAfter } = {}) {
  let pPr = "";
  if (style) pPr += `<w:pStyle w:val="${style}"/>`;
  if (keepNext) pPr += "<w:keepNext/>";
  if (numId !== undefined)
    pPr += `<w:numPr><w:ilvl w:val="${ilvl}"/><w:numId w:val="${numId}"/></w:numPr>`;
  if (spacingAfter !== undefined) pPr += `<w:spacing w:after="${spacingAfter}"/>`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
}

const SPACER = paragraph("", { style: "Spacer" });

class DocumentBuilder {
  constructor(sourceDir) {
    this.sourceDir = sourceDir;
    this.links = new Map(); // URL -> relationship id
    this.anchors = new Map(); // heading slug -> bookmark name
    this.bookmarkId = 0;
    this.nums = []; // extra numbering instances, one per ordered list
  }

  linkId(url) {
    if (!this.links.has(url)) this.links.set(url, `rIdLink${this.links.size + 1}`);
    return this.links.get(url);
  }

  runs(text) {
    return parseInline(text, {}, this.sourceDir)
      .map((run) => {
        let rPr = "";
        if (run.href || run.anchor) rPr += '<w:rStyle w:val="Hyperlink"/>';
        else if (run.code) rPr += '<w:rStyle w:val="InlineCode"/>';
        if ((run.href || run.anchor) && run.code)
          rPr += '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>';
        if (run.bold) rPr += "<w:b/><w:bCs/>";
        const xml = textRun(run.text, rPr);
        if (run.href)
          return `<w:hyperlink r:id="${this.linkId(run.href)}" w:history="1">${xml}</w:hyperlink>`;
        if (run.anchor && this.anchors.has(run.anchor))
          return `<w:hyperlink w:anchor="${this.anchors.get(run.anchor)}" w:history="1">${xml}</w:hyperlink>`;
        return xml;
      })
      .join("");
  }

  bookmark(text, content) {
    const name = this.anchors.get(slugify(text));
    if (!name) return content;
    const id = (this.bookmarkId += 1);
    return `<w:bookmarkStart w:id="${id}" w:name="${name}"/>${content}<w:bookmarkEnd w:id="${id}"/>`;
  }

  orderedNumId() {
    // Numbering instance 1 is bullets, 2 is checkboxes; each ordered list gets
    // its own instance from 3 up so that its numbering restarts at 1.
    this.nums.push(this.nums.length + 3);
    return this.nums[this.nums.length - 1];
  }

  table(header, rows) {
    const columns = header.length;
    const all = [header, ...rows];
    const weights = Array.from({ length: columns }, (_, c) => {
      const cells = all.map((row) => (row[c] ?? "").replace(/[`*]/g, ""));
      const longestWord = Math.max(
        ...cells.flatMap((cell) => cell.split(/\s+/).map((w) => w.length)),
      );
      const longestCell = Math.max(...cells.map((cell) => cell.length));
      return Math.max(longestWord + 2, Math.min(longestCell, 48), 6);
    });
    const total = weights.reduce((sum, w) => sum + w, 0);
    const widths = weights.map((w) => Math.round((w / total) * TEXT_WIDTH));
    widths[columns - 1] += TEXT_WIDTH - widths.reduce((sum, w) => sum + w, 0);

    const border = (side) =>
      `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${COLORS.rule}"/>`;
    const cell = (text, c, isHeader) =>
      `<w:tc><w:tcPr><w:tcW w:w="${widths[c]}" w:type="dxa"/>` +
      (isHeader ? `<w:shd w:val="clear" w:color="auto" w:fill="${COLORS.tableHeader}"/>` : "") +
      `</w:tcPr>${paragraph(this.runs(isHeader ? `**${text}**` : text), { style: "TableText" })}</w:tc>`;
    const row = (cells, isHeader) =>
      `<w:tr><w:trPr><w:cantSplit/>${isHeader ? "<w:tblHeader/>" : ""}</w:trPr>` +
      Array.from({ length: columns }, (_, c) => cell(cells[c] ?? "", c, isHeader)).join("") +
      "</w:tr>";

    return (
      `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
      `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders>` +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>' +
      '<w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar>' +
      '<w:tblLook w:val="0420" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" w:noVBand="1"/>' +
      `</w:tblPr><w:tblGrid>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
      row(header, true) +
      rows.map((cells) => row(cells, false)).join("") +
      "</w:tbl>" +
      SPACER
    );
  }

  code(lines) {
    // A one-cell table draws the box and keeps a short block on one page.
    const border = (side) =>
      `<w:${side} w:val="single" w:sz="4" w:space="0" w:color="${COLORS.rule}"/>`;
    const body = lines
      .map((line) => paragraph(line ? textRun(line) : "", { style: "Code" }))
      .join("");
    return (
      `<w:tbl><w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
      `<w:tblBorders>${["top", "left", "bottom", "right"].map(border).join("")}</w:tblBorders>` +
      `<w:shd w:val="clear" w:color="auto" w:fill="${COLORS.codeFill}"/>` +
      '<w:tblLayout w:type="fixed"/>' +
      '<w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/>' +
      '<w:bottom w:w="100" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar>' +
      `</w:tblPr><w:tblGrid><w:gridCol w:w="${TEXT_WIDTH}"/></w:tblGrid>` +
      `<w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc><w:tcPr><w:tcW w:w="${TEXT_WIDTH}" w:type="dxa"/>` +
      `<w:shd w:val="clear" w:color="auto" w:fill="${COLORS.codeFill}"/></w:tcPr>${body}</w:tc></w:tr></w:tbl>` +
      SPACER
    );
  }

  list(block) {
    const orderedNumId = block.items.some((item) => item.ordered) ? this.orderedNumId() : undefined;
    return block.items
      .map((item, index) => {
        const numId = item.checkbox ? 2 : item.ordered ? orderedNumId : 1;
        // The last item takes normal paragraph spacing before the next block.
        const spacingAfter = index === block.items.length - 1 ? 160 : undefined;
        return paragraph(this.runs(item.text), {
          style: "ListParagraph",
          numId,
          ilvl: item.level,
          spacingAfter,
        });
      })
      .join("");
  }

  body(blocks) {
    const sections = blocks.filter((block) => block.type === "heading" && block.level === 2);
    for (const block of blocks) {
      if (block.type === "heading" && block.level > 1)
        this.anchors.set(slugify(block.text), `_sop${this.anchors.size + 1}`);
    }

    const parts = [];
    let afterTitle = false;
    let contentsDone = false;
    blocks.forEach((block, index) => {
      const next = blocks[index + 1];
      if (block.type === "heading" && block.level === 2 && !contentsDone) {
        contentsDone = true;
        parts.push(paragraph(textRun("Contents"), { style: "ContentsHeading", keepNext: true }));
        for (const section of sections) {
          const name = this.anchors.get(slugify(section.text));
          parts.push(
            paragraph(
              `<w:hyperlink w:anchor="${name}" w:history="1">${this.runs(section.text)}</w:hyperlink>`,
              {
                style: "ContentsEntry",
              },
            ),
          );
        }
      }
      switch (block.type) {
        case "heading": {
          const style = block.level === 1 ? "Title" : `Heading${Math.min(block.level - 1, 3)}`;
          parts.push(paragraph(this.bookmark(block.text, this.runs(block.text)), { style }));
          afterTitle = block.level === 1;
          return;
        }
        case "paragraph":
          parts.push(
            paragraph(this.runs(block.text), {
              style: afterTitle ? "Meta" : undefined,
              keepNext: block.text.endsWith(":") && next !== undefined,
            }),
          );
          break;
        case "quote":
          parts.push(paragraph(this.runs(block.text), { style: "Note" }));
          break;
        case "list":
          parts.push(this.list(block));
          break;
        case "table":
          parts.push(this.table(block.header, block.rows));
          break;
        case "code":
          parts.push(this.code(block.lines));
          break;
      }
      afterTitle = false;
    });
    return parts.join("");
  }
}

function documentXml(body) {
  return (
    `${XML_HEADER}<w:document ${NS}><w:body>${body}` +
    '<w:sectPr><w:footerReference w:type="default" r:id="rIdFooter"/>' +
    `<w:pgSz w:w="${PAGE.width}" w:h="${PAGE.height}"/>` +
    `<w:pgMar w:top="${PAGE.margin}" w:right="${PAGE.margin}" w:bottom="${PAGE.margin}" ` +
    `w:left="${PAGE.margin}" w:header="720" w:footer="576" w:gutter="0"/>` +
    "</w:sectPr></w:body></w:document>"
  );
}

function footerXml() {
  const field = (instr, placeholder) =>
    `<w:fldSimple w:instr=" ${instr} ">${textRun(placeholder)}</w:fldSimple>`;
  return (
    `${XML_HEADER}<w:ftr ${NS}>` +
    paragraph(
      textRun(FOOTER_TEXT) +
        "<w:r><w:tab/></w:r>" +
        textRun("Page ") +
        field("PAGE", "1") +
        textRun(" of ") +
        field("NUMPAGES", "1"),
      { style: "Footer" },
    ) +
    "</w:ftr>"
  );
}

function stylesXml() {
  const font = (name) =>
    `<w:rFonts w:ascii="${name}" w:hAnsi="${name}" w:eastAsia="${name}" w:cs="${name}"/>`;
  const style = (type, id, name, { basedOn, next, pPr = "", rPr = "", extra = "" } = {}) =>
    `<w:style w:type="${type}" w:styleId="${id}"><w:name w:val="${name}"/>` +
    (basedOn ? `<w:basedOn w:val="${basedOn}"/>` : "") +
    (next ? `<w:next w:val="${next}"/>` : "") +
    `${extra}<w:qFormat/>` +
    (pPr ? `<w:pPr>${pPr}</w:pPr>` : "") +
    (rPr ? `<w:rPr>${rPr}</w:rPr>` : "") +
    "</w:style>";
  const heading = (level, size, before, rule) =>
    style("paragraph", `Heading${level}`, `heading ${level}`, {
      basedOn: "Normal",
      next: "Normal",
      pPr:
        "<w:keepNext/><w:keepLines/>" +
        (rule
          ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${COLORS.rule}"/></w:pBdr>`
          : "") +
        `<w:spacing w:before="${before}" w:after="100"/><w:outlineLvl w:val="${level - 1}"/>`,
      rPr: `<w:b/><w:bCs/><w:color w:val="${level === 1 ? COLORS.ink : COLORS.heading}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/>`,
    });

  return (
    `${XML_HEADER}<w:styles ${NS}>` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${font("Calibri")}<w:color w:val="${COLORS.ink}"/>` +
    '<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-CA" w:eastAsia="en-CA" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    style("paragraph", "Title", "Title", {
      basedOn: "Normal",
      next: "Meta",
      pPr: `<w:pBdr><w:bottom w:val="single" w:sz="12" w:space="6" w:color="${COLORS.noteBar}"/></w:pBdr><w:spacing w:after="200"/>`,
      rPr: `<w:b/><w:bCs/><w:color w:val="${COLORS.ink}"/><w:sz w:val="40"/><w:szCs w:val="40"/>`,
    }) +
    style("paragraph", "Meta", "Document details", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="200"/>',
      rPr: `<w:color w:val="${COLORS.muted}"/><w:sz w:val="19"/><w:szCs w:val="19"/>`,
    }) +
    heading(1, 30, 360, true) +
    heading(2, 25, 240, false) +
    heading(3, 22, 200, false) +
    style("paragraph", "ContentsHeading", "Contents heading", {
      basedOn: "Normal",
      next: "ContentsEntry",
      pPr: '<w:keepNext/><w:spacing w:before="120" w:after="60"/>',
      rPr: `<w:b/><w:bCs/><w:color w:val="${COLORS.heading}"/><w:sz w:val="22"/><w:szCs w:val="22"/>`,
    }) +
    style("paragraph", "ContentsEntry", "Contents entry", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="20"/><w:ind w:left="240"/>',
    }) +
    style("paragraph", "ListParagraph", "List Paragraph", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="60"/>',
    }) +
    style("paragraph", "Note", "Note", {
      basedOn: "Normal",
      pPr:
        `<w:pBdr><w:left w:val="single" w:sz="24" w:space="8" w:color="${COLORS.noteBar}"/></w:pBdr>` +
        `<w:shd w:val="clear" w:color="auto" w:fill="${COLORS.noteFill}"/>` +
        '<w:spacing w:before="120" w:after="200"/><w:ind w:left="200" w:right="120"/>',
    }) +
    style("paragraph", "TableText", "Table Text", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="0" w:line="252" w:lineRule="auto"/>',
      rPr: '<w:sz w:val="19"/><w:szCs w:val="19"/>',
    }) +
    style("paragraph", "Code", "Code", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>',
      rPr: `${font(CODE_FONT)}<w:sz w:val="17"/><w:szCs w:val="17"/>`,
    }) +
    style("paragraph", "Spacer", "Spacer", {
      basedOn: "Normal",
      pPr: '<w:spacing w:after="0" w:line="160" w:lineRule="exact"/>',
      rPr: '<w:sz w:val="8"/><w:szCs w:val="8"/>',
    }) +
    style("paragraph", "Footer", "footer", {
      basedOn: "Normal",
      pPr: `<w:tabs><w:tab w:val="right" w:pos="${TEXT_WIDTH}"/></w:tabs><w:spacing w:after="0"/>`,
      rPr: `<w:color w:val="${COLORS.muted}"/><w:sz w:val="16"/><w:szCs w:val="16"/>`,
    }) +
    style("character", "InlineCode", "Inline Code", {
      rPr: `${font(CODE_FONT)}<w:color w:val="${COLORS.heading}"/><w:shd w:val="clear" w:color="auto" w:fill="${COLORS.codeFill}"/>`,
    }) +
    style("character", "Hyperlink", "Hyperlink", {
      rPr: `<w:color w:val="${COLORS.link}"/><w:u w:val="single"/>`,
    }) +
    "</w:styles>"
  );
}

function numberingXml(orderedNums) {
  // Numbered levels indent further so that two-digit numbers fit.
  const level = (ilvl, format, text, fontName) =>
    `<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="${format}"/>` +
    `<w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
    `<w:pPr><w:ind w:left="${(format === "bullet" ? 360 : 440) + ilvl * 360}" ` +
    `w:hanging="${format === "bullet" ? 300 : 380}"/></w:pPr>` +
    (fontName
      ? `<w:rPr><w:rFonts w:ascii="${fontName}" w:hAnsi="${fontName}" w:cs="${fontName}"/></w:rPr>`
      : "") +
    "</w:lvl>";
  const abstract = (id, levels) =>
    `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
  return (
    `${XML_HEADER}<w:numbering ${NS}>` +
    abstract(1, level(0, "bullet", "•", "Calibri") + level(1, "bullet", "◦", "Calibri")) +
    abstract(
      2,
      level(0, "bullet", "☐", "Segoe UI Symbol") + level(1, "bullet", "☐", "Segoe UI Symbol"),
    ) +
    abstract(3, level(0, "decimal", "%1.") + level(1, "lowerLetter", "%2.")) +
    '<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>' +
    '<w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num>' +
    orderedNums
      .map(
        (id) =>
          `<w:num w:numId="${id}"><w:abstractNumId w:val="3"/>` +
          '<w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>',
      )
      .join("") +
    "</w:numbering>"
  );
}

// Code uses Courier New because Word, Google Docs and LibreOffice (as Liberation
// Mono) all have it. Family and pitch hints let a reader without Calibri pick
// a sans-serif font instead of its default serif.
const FONT_TABLE_XML =
  `${XML_HEADER}<w:fonts ${NS}>` +
  '<w:font w:name="Calibri"><w:altName w:val="Carlito"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>' +
  '<w:font w:name="Courier New"><w:family w:val="modern"/><w:pitch w:val="fixed"/></w:font>' +
  '<w:font w:name="Segoe UI Symbol"><w:altName w:val="DejaVu Sans"/><w:family w:val="swiss"/><w:pitch w:val="variable"/></w:font>' +
  "</w:fonts>";

const SETTINGS_XML =
  `${XML_HEADER}<w:settings ${NS}><w:defaultTabStop w:val="720"/>` +
  '<w:characterSpacingControl w:val="doNotCompress"/><w:compat>' +
  '<w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/>' +
  "</w:compat></w:settings>";

function relationshipsXml(relationships) {
  return (
    `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    relationships
      .map(
        ({ id, type, target, external }) =>
          `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/${type}" Target="${esc(target)}"` +
          `${external ? ' TargetMode="External"' : ""}/>`,
      )
      .join("") +
    "</Relationships>"
  );
}

const CONTENT_TYPES_XML =
  `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  [
    ["/word/document.xml", "wordprocessingml.document.main"],
    ["/word/styles.xml", "wordprocessingml.styles"],
    ["/word/numbering.xml", "wordprocessingml.numbering"],
    ["/word/settings.xml", "wordprocessingml.settings"],
    ["/word/fontTable.xml", "wordprocessingml.fontTable"],
    ["/word/footer1.xml", "wordprocessingml.footer"],
  ]
    .map(
      ([part, type]) =>
        `<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`,
    )
    .join("") +
  '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
  "</Types>";

function coreXml(title) {
  return (
    `${XML_HEADER}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:title>${esc(title)}</dc:title><dc:creator>Kindred Asterling</dc:creator>` +
    "</cp:coreProperties>"
  );
}

// Returns the package parts, in order, as [name, Buffer] pairs.
export function buildParts(markdown, source = SOURCE) {
  const blocks = parseBlocks(markdown);
  const titleBlock = blocks.find((block) => block.type === "heading" && block.level === 1);
  const title = titleBlock ? titleBlock.text.replace(/[`*]/g, "") : "Workflow SOP";
  const builder = new DocumentBuilder(path.posix.dirname(source.split(path.sep).join("/")));
  const body = builder.body(blocks);
  const rel = "officeDocument/2006/relationships";
  const documentRels = [
    { id: "rIdStyles", type: `${rel}/styles`, target: "styles.xml" },
    { id: "rIdNumbering", type: `${rel}/numbering`, target: "numbering.xml" },
    { id: "rIdSettings", type: `${rel}/settings`, target: "settings.xml" },
    { id: "rIdFonts", type: `${rel}/fontTable`, target: "fontTable.xml" },
    { id: "rIdFooter", type: `${rel}/footer`, target: "footer1.xml" },
    ...[...builder.links].map(([url, id]) => ({
      id,
      type: `${rel}/hyperlink`,
      target: url,
      external: true,
    })),
  ];
  const packageRels = [
    { id: "rId1", type: `${rel}/officeDocument`, target: "word/document.xml" },
    {
      id: "rId2",
      type: "package/2006/relationships/metadata/core-properties",
      target: "docProps/core.xml",
    },
  ];
  return [
    ["[Content_Types].xml", CONTENT_TYPES_XML],
    ["_rels/.rels", relationshipsXml(packageRels)],
    ["docProps/core.xml", coreXml(title)],
    ["word/document.xml", documentXml(body)],
    ["word/_rels/document.xml.rels", relationshipsXml(documentRels)],
    ["word/styles.xml", stylesXml()],
    ["word/numbering.xml", numberingXml(builder.nums)],
    ["word/settings.xml", SETTINGS_XML],
    ["word/fontTable.xml", FONT_TABLE_XML],
    ["word/footer1.xml", footerXml()],
  ].map(([name, xml]) => [name, Buffer.from(xml, "utf8")]);
}

// ---------------------------------------------------------------------------
// ZIP container (deflate, fixed 1980-01-01 timestamps, UTF-8 names)

const DOS_DATE = (1 << 5) | 1;
const DOS_TIME = 0;

export function zip(parts) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of parts) {
    const nameBytes = Buffer.from(name, "utf8");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = zlib.crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    local.push(header, nameBytes, compressed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(compressed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + compressed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(parts.length, 8);
  end.writeUInt16LE(parts.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}

// Reads a ZIP file into a Map of name -> uncompressed Buffer.
export function unzip(buffer) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) throw new Error("not a ZIP file");
  const files = new Map();
  let p = buffer.readUInt32LE(end + 16);
  for (let n = buffer.readUInt16LE(end + 10); n > 0; n -= 1) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt ZIP directory");
    const method = buffer.readUInt16LE(p + 10);
    const size = buffer.readUInt32LE(p + 20);
    const nameLength = buffer.readUInt16LE(p + 28);
    const name = buffer.toString("utf8", p + 46, p + 46 + nameLength);
    const at = buffer.readUInt32LE(p + 42);
    const start = at + 30 + buffer.readUInt16LE(at + 26) + buffer.readUInt16LE(at + 28);
    const raw = buffer.subarray(start, start + size);
    files.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    p += 46 + nameLength + buffer.readUInt16LE(p + 30) + buffer.readUInt16LE(p + 32);
  }
  return files;
}

// Names the parts that differ between a fresh build and an existing .docx.
export function staleParts(parts, existing) {
  let files;
  try {
    files = unzip(existing);
  } catch {
    return ["(the file is not a valid .docx)"];
  }
  const expected = new Map(parts);
  const names = new Set([...expected.keys(), ...files.keys()]);
  return [...names].filter(
    (name) => !expected.get(name)?.equals(files.get(name) ?? Buffer.alloc(0)),
  );
}

function main(argv) {
  const check = argv.includes("--check");
  const [source = SOURCE, output = OUTPUT] = argv.filter((arg) => !arg.startsWith("--"));
  const parts = buildParts(readFileSync(path.resolve(ROOT, source), "utf8"), source);
  if (check) {
    let existing;
    try {
      existing = readFileSync(path.resolve(ROOT, output));
    } catch {
      console.error(`${output} is missing. Run \`pnpm docs:sop\` and commit it.`);
      return 1;
    }
    const stale = staleParts(parts, existing);
    if (stale.length > 0) {
      console.error(`${output} is out of date with ${source} (${stale.join(", ")}).`);
      console.error("Run `pnpm docs:sop` and commit the result.");
      return 1;
    }
    console.log(`${output} matches ${source}.`);
    return 0;
  }
  writeFileSync(path.resolve(ROOT, output), zip(parts));
  console.log(`Wrote ${output} from ${source}.`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
