const { Blob } = require('buffer');
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File extends Blob {
    constructor(fileBits, fileName, options) {
      super(fileBits, options)
      this.name = fileName
    }
  }
}
