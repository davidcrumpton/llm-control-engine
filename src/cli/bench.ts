import type { CLIOptions, LLMProvider } from "../types.js";

/**
 * Handle bench command
 * @param {LLMProvider} llm - LLM provider instance
 * @param {CLIOptions} options - CLI options
 */
export async function cmdBench(llm: LLMProvider, options: CLIOptions) {
  // 1. Guard against undefined models
  if (!options.model) {
    console.error("Error: No models specified. Use --model='model1,model2'");
    process.exitCode = 1;
    return;
  }

  const models = options.model.split(",").map((m) => m.trim());

  let userContent = options.user || "Hello";
  if (options.stdin) {
    try {
      userContent = await new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf-8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => resolve(data.trim()));
        process.stdin.on("error", reject);
      });
    } catch (err) {
      console.error("Error reading stdin:", err);
      process.exitCode = 1;
      return;
    }
  }

  // 2. Use map to create an array of promises
  const tasks = models.map(async (model) => {
    try {
      const start = Date.now();
      const response = await llm.chat({
        // Assuming method name is chat or similar
        model: model,
        messages: [{ role: "user", content: userContent }],
      });
      const duration = Date.now() - start;

      // bench does not support streaming, so we expect LLMResponse
      if (Symbol.asyncIterator in response) {
        throw new Error("Streaming not supported in bench");
      }

      return {
        model,
        status: "success",
        latency: `${duration}ms`,
        eval_count: response.eval_count || "N/A",
        prompt_eval_count: response.prompt_eval_count || "N/A",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      process.exitCode = 1;
      return {
        model,
        status: "failed",
        error: errorMessage.substring(0, 30), // Truncate error for table readability
      };
    }
  });

  // 3. Wait for all tasks to complete (even if they fail)
  const results = await Promise.all(tasks);

  // 4. Output results
  console.table(results as any[]);
}
