"use client";

import { useMemo } from "react";
import { ChevronUpIcon, FolderIcon } from "lucide-react";
import { useAuiState, type ToolCallMessagePart } from "@assistant-ui/react";
import {
  FileTree,
  type FileTreeNode,
} from "@/components/assistant-ui/elements/file-tree";
import { mono, paper } from "@/lib/surfaces";
import { cn } from "@/lib/utils";

export const WRITE_FILE = "write_file";
export const READ_FILE = "read_file";
export const RUN_COMMAND = "run_command";

export type WriteFileArgs = { path?: string; content?: string };

export type WorkspaceFile = {
  path: string;
  content: string;
  /** How many times the agent has written this path. */
  version: number;
  /** The write is still streaming in. */
  writing: boolean;
};

/**
 * Every conversation has its own workspace. Thread state is already per
 * conversation, so the file list is just the `write_file` calls in this
 * thread, last write per path winning.
 */
export function useWorkspaceFiles(): WorkspaceFile[] {
  const messages = useAuiState((s) => s.thread.messages);

  return useMemo(() => {
    const files = new Map<string, WorkspaceFile>();

    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.content) {
        if (part.type !== "tool-call" || part.toolName !== WRITE_FILE) continue;

        const { args, result } = part as ToolCallMessagePart<WriteFileArgs>;
        const path = args.path;
        if (!path) continue;

        files.set(path, {
          path,
          content: args.content ?? "",
          version: (files.get(path)?.version ?? 0) + 1,
          // Parts read off the thread carry no status of their own; the write
          // is in flight until the tool reports a result.
          writing: result === undefined,
        });
      }
    }

    return [...files.values()];
  }, [messages]);
}

/** Folder headers plus one indented row per file, as the element expects. */
function toNodes(files: readonly WorkspaceFile[]): FileTreeNode[] {
  const nodes: FileTreeNode[] = [];
  const seenDirs = new Set<string>();

  for (const file of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
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
 * it can share the screen with an open canvas.
 */
export function WorkspaceTree({
  files,
  selectedPath,
  onSelectFile,
  expanded,
  onExpandedChange,
  className,
}: {
  files: readonly WorkspaceFile[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
}) {
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

  const header = (
    <button
      type="button"
      onClick={() => onExpandedChange(false)}
      aria-expanded
      aria-label="Collapse workspace"
      className="text-foreground/40 hover:text-foreground/80 -me-1 rounded p-0.5 transition-colors"
    >
      <ChevronUpIcon className="size-3.5" />
    </button>
  );

  if (files.length === 0) {
    return (
      <div className={cn(paper, "w-56 rounded-2xl p-3.5 shadow-lg", className)}>
        <div className="flex items-center justify-between px-1">
          <p className="text-[13.5px] font-medium">Workspace</p>
          {header}
        </div>
        <p className="text-muted-foreground px-1 pt-1 text-[13px]">
          Create a file to start
        </p>
      </div>
    );
  }

  const nodes = toNodes(files);

  return (
    <FileTree
      className={cn("w-56 shadow-lg", className)}
      label="Workspace"
      action={header}
      nodes={nodes}
      visibleCount={nodes.length}
      selectedPath={selectedPath}
      onSelectFile={onSelectFile}
    />
  );
}
