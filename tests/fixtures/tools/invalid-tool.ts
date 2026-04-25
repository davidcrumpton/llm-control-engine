/// tests/fixtures/tools/invalid-tool.ts
// An intentionally malformed tool module — missing required fields
export default {
  // name is missing
  description: "This tool is invalid because it has no name",
  // parameters is missing
  // execute is missing
};
