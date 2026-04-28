import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore
import { cmdPlan } from "@/cli/plan.js";

describe("cmdPlan", () => {
  let tempDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-plan-test-"));
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes plan steps, calls LLM, and saves report", async () => {
    const planPath = path.join(tempDir, "plan.yaml");
    const savePath = path.join(tempDir, "report.md");
    const planYaml = `version: 1
name: Test Plan
model: test-model
system: Testing system
prompt: Analyze step outputs.
steps:
  - name: hello
    exec: echo hello
  - name: world
    exec: echo world
output:
  format: markdown
  save: ${savePath}
`;

    fs.writeFileSync(planPath, planYaml, "utf8");

    const llm = {
      chat: vi
        .fn()
        .mockResolvedValue({ message: { content: "Mock analysis" } }),
    };

    const options = {
      _: [planPath],
      model: undefined,
      "dry-run": false,
      dryRun: false,
      system: undefined,
    };

    await cmdPlan(llm, options);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Mock analysis");
    expect(fs.readFileSync(savePath, "utf8")).toBe("Mock analysis");
  });

  it("prints ordered steps in dry-run mode without executing commands", async () => {
    const planPath = path.join(tempDir, "plan-dry.yaml");
    const planYaml = `version: 1
name: Dry Run Plan
model: test-model
steps:
  - name: hello
    exec: echo hello
  - name: world
    exec: echo world
`;

    fs.writeFileSync(planPath, planYaml, "utf8");

    const llm = {
      chat: vi.fn(),
    };

    const options = {
      _: [planPath],
      model: undefined,
      "dry-run": true,
      dryRun: false,
      system: undefined,
    };

    await cmdPlan(llm, options);

    expect(llm.chat).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("Dry run plan: Dry Run Plan");
    expect(logSpy).toHaveBeenCalledWith("1. hello: echo hello");
    expect(logSpy).toHaveBeenCalledWith("2. world: echo world");
  });

  it("interpolates plan vars and respects CLI overrides", async () => {
    const planPath = path.join(tempDir, "plan-vars.yaml");
    const savePath = path.join(tempDir, "vars-report.md");
    const planYaml = `version: 1
name: Host Health Check
model: test-model
prompt: Analyze the {{env}} host.
system: Run this as {{USER}}
vars:
  host: localhost
  env: dev
steps:
  - name: disk
    exec: ssh {{host}} df -h
output:
  save: ${savePath}
`;

    fs.writeFileSync(planPath, planYaml, "utf8");

    const llm = {
      chat: vi.fn().mockResolvedValue({ message: { content: "Host OK" } }),
    };

    const options = {
      _: [planPath],
      model: undefined,
      "dry-run": false,
      dryRun: false,
      system: undefined,
      var: ["host=proxmox1", "env=prod"],
    };

    await cmdPlan(llm, options);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Host OK");
    expect(fs.readFileSync(savePath, "utf8")).toBe("Host OK");
  });
});
