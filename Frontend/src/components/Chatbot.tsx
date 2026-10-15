import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AlertCircle, FileCode, Loader2, MessageSquare, RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ChatFilePicker } from "@/components/chat/ChatFilePicker";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { useChatHistory, useClearChatHistory, useSendChatMessage } from "@/hooks/useApiQueries";
import { MAX_CHAT_FILES, MAX_CHAT_MESSAGE_LENGTH, chatErrorMessage } from "@/lib/chat";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types/assistant";

const EXAMPLE_QUESTIONS = [
  "Which findings should I fix first, and why?",
  "Explain the most serious security issue and how to fix it.",
  "Which files have the most problems, and what do they have in common?",
];

interface ChatbotProps {
  repoId: string;
  repoName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Ask about this repo": a chat about one repository, in a side sheet.
 *
 * The backend gives the model the latest analysis (scores and top findings)
 * on every question, plus up to three attached files read from GitHub.
 */
export function Chatbot({ repoId, repoName, open, onOpenChange }: ChatbotProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        // Focus goes to the question box, not the close button.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document.getElementById(INPUT_ID)?.focus();
        }}
      >
        <ChatPanel repoId={repoId} repoName={repoName} />
      </SheetContent>
    </Sheet>
  );
}

const INPUT_ID = "repo-chat-input";

function ChatPanel({ repoId, repoName }: { repoId: string; repoName: string }) {
  const [draft, setDraft] = useState("");
  const [attached, setAttached] = useState<string[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const history = useChatHistory(repoId);
  const send = useSendChatMessage(repoId);
  const clear = useClearChatHistory(repoId);

  const messages = history.data ?? [];
  const tooLong = draft.length > MAX_CHAT_MESSAGE_LENGTH;
  const canSend = draft.trim().length > 0 && !tooLong && !send.isPending;

  // Keep the newest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, send.isPending]);

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || message.length > MAX_CHAT_MESSAGE_LENGTH || send.isPending) return;
    const files = attached;
    setSendError(null);
    setDraft("");
    setAttached([]);
    send.mutate(
      { message, contextFiles: files },
      {
        onError: (error) => {
          // The question was rolled back out of the history; give it back.
          setDraft(message);
          setAttached(files);
          setSendError(chatErrorMessage(error));
        },
        onSettled: focusInput,
      }
    );
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  const onClear = () => {
    clear.mutate(undefined, {
      onSuccess: () => {
        setSendError(null);
        focusInput();
      },
    });
  };

  return (
    <>
      <SheetHeader className="space-y-1 border-b border-border px-5 py-4 pr-12 text-left">
        <SheetTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="truncate">Ask about {repoName}</span>
        </SheetTitle>
        <SheetDescription className="text-xs">
          Answers draw on the latest analysis of this repository. Attach up to {MAX_CHAT_FILES} files to ask
          about specific code.
        </SheetDescription>
      </SheetHeader>

      <div
        className="flex-1 overflow-y-auto px-5 py-4"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-busy={send.isPending}
        aria-label="Conversation"
      >
        {history.isLoading ? (
          <div className="space-y-3" aria-label="Loading conversation">
            <Skeleton className="ml-auto h-10 w-2/3" />
            <Skeleton className="h-20 w-5/6" />
          </div>
        ) : history.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>Couldn't load this conversation. Check your connection and retry.</span>
              <Button size="sm" variant="outline" onClick={() => history.refetch()} className="shrink-0 gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : messages.length === 0 && !send.isPending ? (
          <EmptyState onPick={submit} />
        ) : (
          <ol className="space-y-4">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {send.isPending && (
              <li className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thinking…
              </li>
            )}
          </ol>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="space-y-2 border-t border-border px-5 py-4">
        {sendError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-2">
              <span>{sendError}</span>
              <button
                type="button"
                onClick={() => setSendError(null)}
                className="shrink-0 rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Dismiss error"
              >
                <X className="h-4 w-4" />
              </button>
            </AlertDescription>
          </Alert>
        )}

        {attached.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attached files">
            {attached.map((path) => (
              <li
                key={path}
                className="flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/50 py-0.5 pl-2 pr-1 text-xs"
              >
                <FileCode className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate font-mono" title={path}>
                  {path}
                </span>
                <button
                  type="button"
                  onClick={() => setAttached((files) => files.filter((f) => f !== path))}
                  className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Remove ${path}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <label htmlFor={INPUT_ID} className="sr-only">
          Your question
        </label>
        <Textarea
          id={INPUT_ID}
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Ask about findings, files or how to fix something…"
          rows={3}
          className="resize-none"
          aria-describedby="repo-chat-hint"
          aria-invalid={tooLong || undefined}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <ChatFilePicker
              repoId={repoId}
              attached={attached}
              onAttach={(path) => setAttached((files) => (files.length < MAX_CHAT_FILES ? [...files, path] : files))}
              disabled={send.isPending}
            />
            {messages.length > 0 && (
              <ClearHistoryButton onConfirm={onClear} pending={clear.isPending} />
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              id="repo-chat-hint"
              className={cn("hidden text-xs text-muted-foreground sm:inline", tooLong && "inline text-destructive")}
            >
              {tooLong
                ? `${draft.length.toLocaleString()} / ${MAX_CHAT_MESSAGE_LENGTH.toLocaleString()} characters. Shorten your question.`
                : "Enter to send, Shift+Enter for a new line"}
            </span>
            <Button type="submit" size="sm" disabled={!canSend} className="gap-1.5">
              {send.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Send className="h-4 w-4" aria-hidden="true" />
              )}
              Send
            </Button>
          </div>
        </div>
        {clear.isError && (
          <p className="text-xs text-destructive" role="alert">
            Couldn't clear the conversation. Try again.
          </p>
        )}
      </form>
    </>
  );
}

function EmptyState({ onPick }: { onPick: (question: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium">Ask anything about this repository</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">
        RepoIQ answers with the latest analysis in mind. Try one of these:
      </p>
      <ul className="mt-4 w-full max-w-sm space-y-2">
        {EXAMPLE_QUESTIONS.map((q) => (
          <li key={q}>
            <button
              type="button"
              onClick={() => onPick(q)}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const files = message.context_files ?? [];
  return (
    <li className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
      <span className="sr-only">{isUser ? "You said:" : "RepoIQ replied:"}</span>
      <div
        className={cn(
          "max-w-[90%] rounded-lg px-3 py-2",
          isUser ? "bg-primary text-primary-foreground" : "border border-border bg-card",
          message.pending && "opacity-80"
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
        ) : (
          <ChatMarkdown content={message.content} />
        )}
      </div>
      {isUser && files.length > 0 && (
        <p className="mt-1 max-w-[90%] truncate text-xs text-muted-foreground" title={files.join(", ")}>
          Attached: {files.join(", ")}
        </p>
      )}
    </li>
  );
}

function ClearHistoryButton({ onConfirm, pending }: { onConfirm: () => void; pending: boolean }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" disabled={pending}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
          Clear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear this conversation?</AlertDialogTitle>
          <AlertDialogDescription>
            Every question and answer about this repository is deleted. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Clear conversation</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default Chatbot;
