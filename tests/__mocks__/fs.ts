/// tests/__mocks__/fs.ts
// Auto-mock for 'node:fs' using memfs
// Install: npm install -D memfs
export { fs as default } from 'memfs';
export {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  copyFileSync,
  createReadStream,
  createWriteStream,
} from 'memfs';