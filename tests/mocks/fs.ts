import { fs, vol } from "memfs";

vol.fromJSON({});

export default {
  ...fs,
  vol,
};
