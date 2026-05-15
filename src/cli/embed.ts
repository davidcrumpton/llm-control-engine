import fs from "fs/promises";
import type { CLIOptions, LLMProvider } from "../types.js";

/**
 * Helper to perform the embedding call
 * @param {LLMProvider} llm - LLM provider instance
 * @param {string} model - Model name
 * @param {string} content - The text to embed
 * @returns {Promise<any>}
 */
async function performEmbedding(
  llm: LLMProvider,
  model: string,
  content: string,
): Promise<any> {
  const res = await llm.embeddings!({
    model,
    prompt: content,
  });
  return (res as any).embedding;
}

/**
 * Handle embed command
 * @param {LLMProvider} llm - LLM provider instance
 * @param {CLIOptions} options - CLI options
 */
export async function cmdEmbed(llm: LLMProvider, options: CLIOptions) {
  const { model, stdin, files } = options;

  if (!model) {
    throw new Error("Error: No model specified for embedding.");
  }

  if (!files && !stdin) {
    throw new Error(
      "Error: Provide files with -f or stdin with --s or --stdin",
    );
  }

  try {
    const tasks = [];

    if (stdin) {
      const stdinTask = (async () => {
        const content = await new Promise((resolve, reject) => {
          let data = "";
          process.stdin.on("data", (chunk) => (data += chunk));
          process.stdin.on("end", () => {
            if (!data.trim()) {
              reject(new Error("stdin was empty"));
            } else {
              resolve(data);
            }
          });
          process.stdin.on("error", reject);
        });
        const embedding = await performEmbedding(llm, model!, content as string);
        return { file: "stdin", embedding };
      })();
      tasks.push(stdinTask);
    }

    if (files) {
      const fileList = Array.isArray(files) ? files : [files];
      for (const filePath of fileList) {
        const fileTask = (async () => {
          const content = await fs.readFile(filePath, "utf8");
          const embedding = await performEmbedding(llm, model!, content);
          return { file: filePath, embedding };
        })();
        tasks.push(fileTask);
      }
    }

    const results = await Promise.allSettled(tasks);

    const successfulResults = results
      .filter((res) => res.status === "fulfilled")
      .map((res) => res.value);

    const failures = results
      .filter((res) => res.status === "rejected")
      .map((res) => res.reason.message);

    if (failures.length > 0) {
      console.error("Errors encountered:", JSON.stringify(failures, null, 2));
      throw new Error(`${failures.length} embedding(s) failed`);
    }

    console.log(JSON.stringify(successfulResults as any, null, 2));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Fatal error during embedding process: ${message}`);
  }
}
