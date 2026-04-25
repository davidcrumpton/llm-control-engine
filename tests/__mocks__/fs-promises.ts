// tests/__mocks__/fs-promises.ts
import { Volume, createFsFromVolume } from "memfs";

// Create an empty in-memory filesystem
const vol = Volume.fromJSON({});

// Create a Node-like fs interface
const fs = createFsFromVolume(vol);

// Export the promises API
export default fs.promises;
