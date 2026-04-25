/// tests/__mocks__/fs-promises.ts
// Auto-mock for 'node:fs/promises' using memfs
export {
  readFile,
  writeFile,
  mkdir,
  readdir,
  stat,
  unlink,
  copyFile,
  access,
  rm,
} from "memfs/lib/promises";
