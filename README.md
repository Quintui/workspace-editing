# workspace-editing

A chat interface that is a window onto an agent's workspace, built with
[assistant-ui](https://assistant-ui.com) primitives and [Mastra](https://mastra.ai).

Instead of giving the model a growing pile of bespoke tools, the agent gets a
computer: a directory it reads, writes, and runs commands in. A document is not
a special object owned by the frontend — it is a file in the agent's workspace,
and the canvas is a view onto that file.

Each conversation gets its own workspace. Thread `abc` writes to
`workspace/abc/`, and only the agent working in that thread can see it.

## Running it

```bash
npm install
echo 'OPENROUTER_API_KEY=sk-or-...' >> .env.local
npm run dev
```

The default model is `openrouter/openai/gpt-5.6-luna`. Point `MASTRA_MODEL` at
any model in Mastra's router — `anthropic/claude-sonnet-5`, `openai/gpt-5.6-sol`
— and set that provider's key instead.

Two things appear on first run and are both gitignored: `mastra.db`, holding
conversations and messages, and `workspace/`, holding the agent's files.

## How it fits together

| Layer | What it is |
| --- | --- |
| Interface | assistant-ui primitives, in `app/assistant.tsx` and `components/assistant-ui/` |
| Agent | a Mastra `Agent` with `Memory` and a `Workspace`, in `mastra/` |
| Computer | `LocalSandbox` for the shell, `LocalFilesystem` for the files |
| Storage | `LibSQLStore` writing to `mastra.db` |

`app/api/chat/route.ts` streams the agent through `handleChatStream` in AI SDK
v7 format, which is what `AssistantChatTransport` on the client speaks.

### Per-conversation workspaces

The agent's `Workspace` resolves its filesystem and sandbox per request from the
thread id on the request context:

```ts
new Workspace({
  filesystem: (ctx) => new LocalFilesystem({ basePath: threadDir(ctx) }),
  sandbox: async (ctx) => { /* LocalSandbox in the same directory */ },
  sandboxCacheKey: ({ requestContext }) => requestContext.get(MASTRA_THREAD_ID_KEY),
})
```

The chat route sets that thread id from the request body, where
`AssistantChatTransport` puts the thread's remote id. Deleting a conversation
deletes its directory too.

Sandbox commands run under Seatbelt on macOS or Bubblewrap on Linux when either
is available, confined to the thread's directory with network access left on. If
neither is available, `LocalSandbox` falls back to running commands directly on
the host with this process's permissions.

### Conversations

The thread list is backed by Mastra memory, not assistant-ui cloud. A
`RemoteThreadListAdapter` in `components/assistant-ui/mastra-threads.tsx` maps
the sidebar onto `memory.listThreads()`, `createThread`, `updateThread`, and
`deleteThread` over `/api/threads`. Switching conversations replays history
through `memory.recall()`; nothing is written from the client, because the
agent's memory already persists every message server-side. Titles are generated
by Mastra (`generateTitle: true`) once the first exchange is saved.

### The workspace view

The tree and canvas read the thread's directory over `/api/threads/:id/files`,
refetched whenever a run finishes — so they show what is actually on disk, not
what the transcript happens to mention. A `write_file` that is still streaming
is laid over the top, which is what makes a document appear in the canvas
character by character as the agent writes it.

Files go the other way too: drop them on the tree, or use its add button, and
they `POST` to the same route and land in the thread's directory. There is no
separate notion of an upload — the agent picks them up with the same
`read_file` it uses on its own work. Text only, up to 200KB, and an added file
never overwrites one already there.

| Piece | Built from |
| --- | --- |
| Conversation list | `ThreadListPrimitive`, `ThreadListItemPrimitive` |
| Thread, composer, messages | `ThreadPrimitive`, `MessagePrimitive`, `ComposerPrimitive`, `ActionBarPrimitive`, `BranchPickerPrimitive` |
| Reasoning | the `reasoning` element, restyled to match the tool timeline |
| Tool calls | the `tool-timeline` element |
| Created files | the `artifact-card` element |
| Workspace tree | the `file-tree` element, floating over the thread |
| Document canvas | the `canvas-split` element |

`write_file` renders as its own artifact card outside the chain-of-thought
because its tool UI is registered with `display: "standalone"`; every other
workspace tool falls into the timeline.

## Notes on the vendored elements

assistant-ui registry components are copied into `components/assistant-ui/` and
are meant to be edited. A few carry local changes:

- `tool-timeline.tsx` — rows were keyed by chip text, which collides when a run
  reads and writes the same file; keyed by index instead.
- `file-tree.tsx` — added row selection, an optional header action, and made the
  diff totals optional, since this is a file browser rather than a diff summary.
- `canvas-split.tsx` — the version badge is optional; a file on disk has no
  version history to show.
- `reasoning.tsx` — defaults to the borderless `ghost` variant with a
  timeline-style trigger.
- `tool-fallback.aui.tsx` — the registry ships ahead of the published
  `@assistant-ui/react`; local shims cover approval fields that aren't in the
  released types yet. Remove them when the package catches up.
