import { LibSQLStore } from "@mastra/libsql";

/**
 * Threads and messages live in a SQLite file next to the project. Shared by the
 * Mastra instance and the agent's memory so both read the same threads.
 */
export const storage = new LibSQLStore({
  id: "workspace-editing",
  url: `file:${process.cwd()}/mastra.db`,
});
