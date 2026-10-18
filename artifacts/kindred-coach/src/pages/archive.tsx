import { useState } from "react";
import {
  useListArchivedChats,
  getListArchivedChatsQueryKey,
  getArchivedChat,
  type ChatConversation,
  type ChatConversationWithMessages,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  Download,
  FileText,
  Loader2,
  Archive as ArchiveIcon,
  MessagesSquare,
} from "lucide-react";

function buildTxt(conv: ChatConversationWithMessages): string {
  const lines: string[] = [];
  lines.push(`${conv.title}`);
  lines.push(
    `Archived: ${conv.archivedAt ? format(new Date(conv.archivedAt), "PPpp") : "—"}`,
  );
  lines.push("");
  for (const m of conv.messages) {
    const who = m.role === "user" ? "You" : "Kindred";
    const when = format(new Date(m.createdAt), "PPp");
    lines.push(`[${when}] ${who}:`);
    lines.push(m.content);
    lines.push("");
  }
  return lines.join("\n");
}

function buildHtml(conv: ChatConversationWithMessages): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = conv.messages
    .map((m) => {
      const who = m.role === "user" ? "You" : "Kindred";
      const when = format(new Date(m.createdAt), "PPp");
      return `<div class="msg ${m.role}"><div class="meta">${escape(who)} · ${escape(when)}</div><div class="content">${escape(m.content).replace(/\n/g, "<br/>")}</div></div>`;
    })
    .join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(conv.title)}</title>
<style>
body{font-family:Georgia,serif;max-width:680px;margin:40px auto;padding:0 20px;color:#222;line-height:1.5}
h1{font-size:24px;margin-bottom:4px}
.sub{color:#888;font-size:13px;margin-bottom:24px}
.msg{margin-bottom:18px}
.meta{font-size:12px;color:#888;margin-bottom:4px}
.msg.user .content{background:#f0e8ff;padding:10px 14px;border-radius:10px;display:inline-block}
.msg.assistant .content,.msg.crisis_support .content{background:#f4f4f4;padding:10px 14px;border-radius:10px;display:inline-block}
@media print{body{margin:0}}
</style></head><body>
<h1>${escape(conv.title)}</h1>
<div class="sub">Archived ${conv.archivedAt ? format(new Date(conv.archivedAt), "PPpp") : "—"}</div>
${rows}
</body></html>`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ArchivedRow({ conv }: { conv: ChatConversation }) {
  const [busy, setBusy] = useState<"txt" | "pdf" | null>(null);

  async function handle(kind: "txt" | "pdf") {
    setBusy(kind);
    try {
      const full = await getArchivedChat(conv.id);
      const stamp = format(
        new Date(conv.archivedAt ?? conv.createdAt),
        "yyyy-MM-dd-HHmm",
      );
      if (kind === "txt") {
        download(
          `kindred-chat-${stamp}.txt`,
          buildTxt(full),
          "text/plain;charset=utf-8",
        );
      } else {
        const html = buildHtml(full);
        const w = window.open("", "_blank");
        if (w) {
          w.document.open();
          w.document.write(html);
          w.document.close();
          setTimeout(() => w.print(), 300);
        }
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-card">
      <div className="min-w-0">
        <p className="font-medium text-sm truncate">{conv.title}</p>
        <p className="text-xs text-muted-foreground">
          Archived {format(new Date(conv.archivedAt ?? conv.createdAt), "PPp")}
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => handle("txt")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors disabled:opacity-50"
          data-testid={`download-txt-${conv.id}`}
          aria-label="Download chat as TXT"
        >
          {busy === "txt" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileText className="w-3.5 h-3.5" />
          )}
          TXT
        </button>
        <button
          onClick={() => handle("pdf")}
          disabled={busy !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-muted transition-colors disabled:opacity-50"
          data-testid={`download-pdf-${conv.id}`}
          aria-label="Download chat as PDF"
        >
          {busy === "pdf" ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          PDF
        </button>
      </div>
    </div>
  );
}

export default function Archive() {
  const { data, isLoading } = useListArchivedChats({
    query: { queryKey: getListArchivedChatsQueryKey() },
  });
  const rows = data ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="pt-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-serif text-foreground tracking-tight">
            Archive
          </h1>
          <p className="text-muted-foreground">Past coaching conversations</p>
        </div>
        <Link
          href="/talk"
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="talk-chat-link"
        >
          <MessagesSquare className="w-3.5 h-3.5" strokeWidth={2} />
          Back to your conversation
        </Link>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <ArchiveIcon className="w-10 h-10 mb-3 opacity-50" />
          <p className="text-sm">No archived conversations yet.</p>
          <p className="text-xs mt-1">
            When you archive a chat, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <ArchivedRow key={c.id} conv={c} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground/70 pt-2">
        PDF export opens a print-ready view — choose "Save as PDF" in the print
        dialog.
      </p>
    </div>
  );
}
