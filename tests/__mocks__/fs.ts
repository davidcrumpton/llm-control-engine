// tests/__mocks__/fs.ts
import { Volume, createFsFromVolume } from "memfs";

// Create an empty in-memory filesystem
const vol = Volume.fromJSON({});

// Create a Node-like fs interface
const fs = createFsFromVolume(vol);

// Export the fs object exactly like Node's fs module
export default fs;
