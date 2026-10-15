import { useMemo, useState } from "react";
import { FileCode, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepositoryFiles } from "@/hooks/useApiQueries";
import { MAX_CHAT_FILES, extractFilePaths } from "@/lib/chat";

/** Rendering thousands of paths makes the list sluggish; narrowing is one keystroke away. */
const MAX_RESULTS = 100;

interface ChatFilePickerProps {
  repoId: string;
  attached: string[];
  onAttach: (path: string) => void;
  disabled?: boolean;
}

export function ChatFilePicker({ repoId, attached, onAttach, disabled }: ChatFilePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const full = attached.length >= MAX_CHAT_FILES;

  // Same query (and cache) as the Files page; only fetched once the picker opens.
  const { data, isLoading, isError } = useRepositoryFiles(repoId, { enabled: !!repoId && open });
  const paths = useMemo(() => extractFilePaths(data), [data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const available = paths.filter((p) => !attached.includes(p));
    return q ? available.filter((p) => p.toLowerCase().includes(q)) : available;
  }, [paths, attached, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          disabled={disabled || full}
          title={full ? `You can attach up to ${MAX_CHAT_FILES} files` : undefined}
        >
          <Paperclip className="h-4 w-4" aria-hidden="true" />
          Attach file
          <span className="sr-only">
            {" "}
            ({attached.length} of {MAX_CHAT_FILES} attached)
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] p-0" align="start" side="top">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search files by path…"
            value={query}
            onValueChange={setQuery}
            aria-label="Search repository files"
          />
          <CommandList>
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Loading files…
              </div>
            ) : isError ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Couldn't load the file list. Close this and try again.
              </p>
            ) : (
              <>
                <CommandEmpty>{query ? "No files match that path." : "No files found."}</CommandEmpty>
                {matches.length > 0 && (
                  <CommandGroup
                    heading={
                      matches.length > MAX_RESULTS
                        ? `Showing ${MAX_RESULTS} of ${matches.length}. Type to narrow.`
                        : undefined
                    }
                  >
                    {matches.slice(0, MAX_RESULTS).map((path) => (
                      <CommandItem
                        key={path}
                        value={path}
                        onSelect={() => {
                          onAttach(path);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="gap-2"
                      >
                        <FileCode className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className="truncate font-mono text-xs" title={path}>
                          {path}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
