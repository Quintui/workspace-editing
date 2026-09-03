"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronUpIcon, FolderIcon, PlusIcon } from "lucide-react";
import { useAui, useAuiState, type ToolCallMessagePart } from "@assistant-ui/react";
import {
  getPartialJsonObjectFieldState,
  getPartialJsonObjectMeta,
} from "assistant-stream/utils";
import {
  FileTree,
  type FileTreeNode,
} from "@/components/assistant-ui/elements/file-tree";
import { mono, paper } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

// Mastra's workspace tools, as the model sees them.
const PREFIX = "mastra_workspace_";
export const WRITE_FILE = `${PREFIX}write_file`;
export const READ_FILE = `${PREFIX}read_file`;
export const EDIT_FILE = `${PREFIX}edit_file`;
export const LIST_FILES = `${PREFIX}list_files`;
export const GREP = `${PREFIX}grep`;
export const MKDIR = `${PREFIX}mkdir`;
export const DELETE = `${PREFIX}delete`;
export const FILE_STAT = `${PREFIX}file_stat`;
export const EXECUTE_COMMAND = `${PREFIX}execute_command`;

export type WriteFileArgs = { path?: string; content?: string };

/**
 * Tool arguments arrive as partial JSON, so a string field is a truncated
 * prefix of itself until it closes — `"competitors.md"` shows up as `"compet"`
 * first. Acting on a prefix points the canvas at a path no file has, so it
 * blanks and then reopens. Arguments that carry no streaming metadata are
 * already final.
 */
function isSettled(args: object, field: string): boolean {
  const meta = getPartialJsonObjectMeta(args as Record<symbol, unknown>);
  if (!meta) return true;
  return (
    getPartialJsonObjectFieldState(args as Record<string, unknown>, [field]) ===
    "complete"
  );
}

export type WorkspaceFile = {
  path: string;
  content: string;
  /** The agent is still streaming this file's contents. */
  writing: boolean;
};

/**
 * The conversation's files. The list is whatever is on disk in this thread's
 * workspace directory, refetched once the agent stops working, with any
 * in-flight `write_file` laid over the top so the canvas can stream.
 */
export function useWorkspaceFiles(): {
  files: WorkspaceFile[];
  refresh: () => void;
} {
  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const messages = useAuiState((s) => s.thread.messages);
  const [saved, setSaved] = useState<WorkspaceFile[]>([]);

  const refresh = useCallback(async () => {
    const item = aui.threadListItem;
    const threadId = item.source ? item.getState().remoteId : undefined;
    if (!threadId) {
      setSaved([]);
      return;
    }
    const res = await fetch(`/api/threads/${threadId}/files`);
    if (!res.ok) return;
    const files: { path: string; content: string }[] = await res.json();
    setSaved(files.map((f) => ({ ...f, writing: false })));
  }, [aui]);

  // On thread switch and again whenever a run finishes, which is when the
  // agent's writes have landed.
  useEffect(() => {
    if (!isRunning) void refresh();
  }, [isRunning, refresh]);

  // A file the agent is writing right now exists only in the tool call.
  const streaming = useMemo(() => {
    const inFlight = new Map<string, WorkspaceFile>();
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== WRITE_FILE) continue;
        const { args, result } = part as ToolCallMessagePart<WriteFileArgs>;
        if (!args.path || result !== undefined) continue;
        if (!isSettled(args, "path")) continue;
        inFlight.set(args.path, {
          path: args.path,
          content: args.content ?? "",
          writing: true,
        });
      }
    }
    return inFlight;
  }, [messages]);

  const files = useMemo(() => {
    const merged = new Map(saved.map((file) => [file.path, file]));
    for (const [path, file] of streaming) merged.set(path, file);
    return [...merged.values()].sort((a, b) => a.path.localeCompare(b.path));
  }, [saved, streaming]);

  return { files, refresh };
}

/**
 * Puts the user's own files in the workspace. A file dropped before the first
 * message has no thread to land in yet, so the conversation is created first.
 */
function useAddFiles(onAdded: () => void) {
  const aui = useAui();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const addFiles = useCallback(
    async (list: FileList | null) => {
      if (!list?.length) return;
      setBusy(true);
      setError(undefined);
      try {
        const item = aui.threadListItem;
        const threadId =
          (item.source ? item.getState().remoteId : undefined) ??
          (await item.initialize()).remoteId;

        const body = new FormData();
        for (const file of list) body.append("file", file);

        const res = await fetch(`/api/threads/${threadId}/files`, {
          method: "POST",
          body,
        });
        if (!res.ok) {
          const failure = await res.json().catch(() => null);
          setError(failure?.error ?? "Could not add the file");
          return;
        }
        onAdded();
      } catch {
        setError("Could not add the file");
      } finally {
        setBusy(false);
      }
    },
    [aui, onAdded],
  );

  return { addFiles, busy, error };
}

/** Folder headers plus one indented row per file, as the element expects. */
function toNodes(files: readonly WorkspaceFile[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  const seenDirs = new Set<string>();

  for (const file of files) {
    const slash = file.path.lastIndexOf("/");
    const dir = slash === -1 ? "" : file.path.slice(0, slash);

    if (dir && !seenDirs.has(dir)) {
      seenDirs.add(dir);
      nodes.push({ path: `dir:${dir}`, name: dir, depth: 0, kind: "folder" });
    }

    nodes.push({
      path: file.path,
      name: slash === -1 ? file.path : file.path.slice(slash + 1),
      depth: dir ? 1 : 0,
      kind: "file",
    });
  }

  return nodes;
}

/**
 * The conversation's files, floating over the thread. Collapses to a pill so
 * it can share the screen with an open canvas. Files can be dropped on it or
 * picked from its add button.
 */
export function WorkspaceTree({
  files,
  selectedPath,
  onSelectFile,
  onFilesAdded,
  expanded,
  onExpandedChange,
  className,
}: {
  files: readonly WorkspaceFile[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  /** Called once the user's files have landed in the workspace. */
  onFilesAdded: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}) {
  const { addFiles, busy, error } = useAddFiles(onFilesAdded);
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpandedChange(true)}
        aria-expanded={false}
        className={cn(
          paper,
          "flex items-center gap-2 rounded-full py-1.5 ps-3 pe-3.5 shadow-lg transition-transform hover:-translate-y-px active:scale-[0.98]",
          className,
        )}
      >
        <FolderIcon className="text-foreground/40 size-3.5" />
        <span className="text-[13px] font-medium">Workspace</span>
        {files.length > 0 && (
          <span className={cn(mono, "text-foreground/45 tabular-nums")}>
            {files.length}
          </span>
        )}
      </button>
    );
  }

  const actions = (
    <div className="flex items-center gap-0.5">
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(e.target.files);
          // Cleared so picking the same file twice still fires a change.
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => picker.current?.click()}
        disabled={busy}
        aria-label="Add files"
        title="Add files"
        className="text-foreground/40 hover:text-foreground/80 rounded p-0.5 transition-colors disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onExpandedChange(false)}
        aria-expanded
        aria-label="Collapse workspace"
        className="text-foreground/40 hover:text-foreground/80 -me-1 rounded p-0.5 transition-colors"
      >
        <ChevronUpIcon className="size-3.5" />
      </button>
    </div>
  );

  const ring = over ? "ring-foreground/25 ring-2" : undefined;
  const nodes = toNodes(files);

  return (
    <div
      className={cn("flex w-56 flex-col gap-1", className)}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      // Moving onto a child fires dragleave on the parent, so only a move that
      // actually left the card counts.
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setOver(false);
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void addFiles(e.dataTransfer.files);
      }}
    >
      {files.length === 0 ? (
        <div className={cn(paper, "rounded-2xl p-3.5 shadow-lg", ring)}>
          <div className="flex items-center justify-between px-1">
            <p className="text-[13.5px] font-medium">Workspace</p>
            {actions}
          </div>
          <p className="text-muted-foreground px-1 pt-1 text-[13px]">
            {busy ? "Adding\u2026" : "Drop a file in, or ask for one"}
          </p>
        </div>
      ) : (
        <FileTree
          className={cn("w-full shadow-lg", ring)}
          label="Workspace"
          action={actions}
          nodes={nodes}
          visibleCount={nodes.length}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      )}
      {error && (
        <p className="px-2 text-[12px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
