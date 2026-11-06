// =============================================================================
// Inbox (IA pazi "Inbox"). Dati reali dal BFF: chat centrale degli agenti
// (business.conversation / business.message). Conversazioni a sinistra, thread
// a destra, invio di un nuovo turno in chat.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { Inbox as InboxIcon, MessageSquare, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, KpiCard, PageHeader } from "@/components/common/PageElements";
import {
  useConversation,
  useConversations,
  useCreateConversation,
  useSendMessage,
} from "@/lib/platform-queries";
import { cn, formatRelative } from "@/lib/utils";

export default function Inbox() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const conversations = useConversations();
  const createConversation = useCreateConversation();
  const sendMessage = useSendMessage();

  const rows = conversations.data ?? [];

  useEffect(() => {
    if (!selectedId && rows.length > 0) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const conversation = useConversation(selectedId);

  const messages = conversation.data?.messages ?? [];
  const stats = useMemo(
    () => ({
      total: rows.length,
      updated: rows.filter((row) => {
        const ageHours = (Date.now() - new Date(row.updated_at).getTime()) / 3_600_000;
        return ageHours <= 24;
      }).length,
    }),
    [rows],
  );

  function handleNewConversation() {
    createConversation.mutate(undefined, {
      onSuccess: (row) => {
        setSelectedId(row.id);
        toast({ kind: "success", title: "Conversazione creata" });
      },
      onError: (error) =>
        toast({ kind: "error", title: "Creazione fallita", description: error.message }),
    });
  }

  function handleSend(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId) return;
    sendMessage.mutate(
      { text, conversationId: selectedId },
      {
        onSuccess: () => setDraft(""),
        onError: (error) =>
          toast({ kind: "error", title: "Invio fallito", description: error.message }),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inbox"
        description="Tutte le conversazioni con gli agenti: ogni thread e' tracciato e metratizzato."
        actions={
          <Button variant="primary" onClick={handleNewConversation} loading={createConversation.isPending}>
            Nuova conversazione
          </Button>
        }
      />

      <section aria-label="Statistiche inbox" className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          label="Conversazioni"
          value={String(stats.total)}
          icon={<InboxIcon className="h-5 w-5 text-secondary" aria-hidden="true" />}
        />
        <KpiCard label="Aggiornate oggi" value={String(stats.updated)} hint="ultime 24 ore" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card bodyClassName="p-0" className="h-fit">
          <div className="border-b border-secondary/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-text-primary">Thread</h2>
          </div>
          {conversations.isLoading ? (
            <div className="p-4">
              <Skeleton lines={5} />
            </div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-text-muted">Nessuna conversazione.</p>
          ) : (
            <ul className="max-h-[520px] divide-y divide-secondary/10 overflow-y-auto">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-bg-hover",
                      selectedId === row.id && "bg-secondary/10",
                    )}
                    aria-current={selectedId === row.id}
                  >
                    <span className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-secondary" aria-hidden="true" />
                      <span className="truncate text-sm font-medium text-text-primary">
                        {row.title || "Conversazione"}
                      </span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {row.kind === "chat" ? "Chat" : "Run"} · {formatRelative(row.updated_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card bodyClassName="flex h-[520px] flex-col p-0">
          {conversation.isLoading ? (
            <div className="p-4">
              <Skeleton lines={8} />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" aria-hidden="true" />}
              title="Thread vuoto"
              description="Scrivi un messaggio per attivare gli agenti su questo thread."
            />
          ) : (
            <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              {messages.map((message) => (
                <li
                  key={message.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg px-4 py-3",
                    message.role === "user"
                      ? "ml-auto max-w-[80%] bg-secondary/15"
                      : "mr-auto max-w-[80%] bg-bg-hover",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
                    <span className="font-medium text-text-secondary">
                      {message.role === "user" ? "Tu" : message.droid}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelative(message.created_at)}</span>
                    {message.credits > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{message.credits} crediti</span>
                      </>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-text-primary">{message.content}</p>
                </li>
              ))}
            </ul>
          )}

          <form
            className="flex items-end gap-2 border-t border-secondary/10 px-4 py-3"
            onSubmit={handleSend}
          >
            <label className="sr-only" htmlFor="inbox-draft">
              Scrivi un messaggio
            </label>
            <textarea
              id="inbox-draft"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={2}
              placeholder="Scrivi un messaggio agli agenti…"
              className="w-full resize-none rounded-lg border border-secondary/20 bg-primary/60 px-3 py-2 text-sm text-text-primary focus:border-secondary focus:outline-none focus:ring-1 focus:ring-secondary"
            />
            <Button
              type="submit"
              variant="primary"
              loading={sendMessage.isPending}
              disabled={!draft.trim() || !selectedId}
              aria-label="Invia messaggio"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          {conversation.data?.conversation && (
            <div className="border-t border-secondary/10 px-4 py-2">
              <Badge variant="default">
                {conversation.data.conversation.kind === "chat" ? "Chat" : "Run"} ·{" "}
                {formatRelative(conversation.data.conversation.updated_at)}
              </Badge>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
