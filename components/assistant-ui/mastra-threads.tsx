"use client";

import { useCallback, useMemo } from "react";
import {
  RuntimeAdapterProvider,
  useAui,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
} from "@assistant-ui/react";

type ThreadRow = {
  id: string;
  title?: string;
  updatedAt: string;
  archived: boolean;
};

const json = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed: ${res.status}`);
  return res.json();
};

const patch = (id: string, body: Record<string, unknown>) =>
  json(`/api/threads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

/**
 * Loads a thread's messages back out of Mastra memory. Nothing is written from
 * here: the agent's own memory persists every message server-side, so `append`
 * would only duplicate it.
 */
function useMastraHistory(): ThreadHistoryAdapter {
  const aui = useAui();

  return useMemo(
    () => ({
      async load() {
        return { messages: [] };
      },
      async append() {},
      withFormat(formatAdapter) {
        return {
          async append() {},
          async load() {
            const item = aui.threadListItem;
            const remoteId = item.source ? item.getState().remoteId : undefined;
            if (!remoteId) return { messages: [] };

            const messages = await json(`/api/threads/${remoteId}/messages`);

            // The repository is a tree; a replayed conversation is one branch,
            // so each message's parent is the one before it.
            let parentId: string | null = null;
            return {
              messages: messages.map((message: never) => {
                const item = { parentId, message };
                parentId = formatAdapter.getId(message);
                return item;
              }),
            };
          },
        };
      },
    }),
    [aui],
  );
}

/**
 * The conversation list, backed by Mastra memory's threads rather than
 * assistant-ui cloud. Thread ids are Mastra thread ids, which is also what the
 * chat route uses to pick the conversation's workspace directory.
 */
export function useMastraThreadListAdapter(): RemoteThreadListAdapter {
  const unstable_useAdapters = useCallback(function useAdapters() {
    const history = useMastraHistory();
    return useMemo(() => ({ history }), [history]);
  }, []);

  const unstable_Provider = useCallback(function Provider({
    children,
  }: {
    children?: React.ReactNode;
  }) {
    const history = useMastraHistory();
    const adapters = useMemo(() => ({ history }), [history]);
    return <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>;
  }, []);

  return useMemo(
    () => ({
      async list() {
        const threads: ThreadRow[] = await json("/api/threads");
        return {
          threads: threads.map((thread) => ({
            status: thread.archived ? ("archived" as const) : ("regular" as const),
            remoteId: thread.id,
            title: thread.title,
            lastMessageAt: new Date(thread.updatedAt),
          })),
        };
      },

      async initialize() {
        const { id } = await json("/api/threads", { method: "POST" });
        return { remoteId: id };
      },

      async fetch(threadId) {
        const threads: ThreadRow[] = await json("/api/threads");
        const thread = threads.find((t) => t.id === threadId);
        if (!thread) throw new Error(`Thread ${threadId} not found`);
        return {
          status: thread.archived ? "archived" : "regular",
          remoteId: thread.id,
          title: thread.title,
          lastMessageAt: new Date(thread.updatedAt),
        };
      },

      rename: (threadId, title) => patch(threadId, { title }),
      archive: (threadId) => patch(threadId, { archived: true }),
      unarchive: (threadId) => patch(threadId, { archived: false }),
      delete: (threadId) => json(`/api/threads/${threadId}`, { method: "DELETE" }),

      // Mastra generates the title itself once the first exchange is saved
      // (`generateTitle: true` on the agent's memory), so there is nothing to
      // stream here; the next list refresh picks it up.
      async generateTitle() {
        return new ReadableStream({ start: (controller) => controller.close() });
      },

      unstable_Provider,
      unstable_useAdapters,
    }),
    [unstable_Provider, unstable_useAdapters],
  );
}
