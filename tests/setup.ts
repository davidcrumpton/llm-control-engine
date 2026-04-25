/// tests/setup.ts
import { vi, beforeAll, afterAll, afterEach } from "vitest";

// Global mocks applied to every test file
vi.mock("node:fs");
vi.mock("node:fs/promises");
vi.mock("node:child_process");

beforeAll(() => {
  // Suppress console noise during tests
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  vi.restoreAllMocks();
});
