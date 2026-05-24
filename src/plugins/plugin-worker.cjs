// src/plugins/plugin-worker.cjs
// Runs in a Worker thread — outside the pkg snapshot, so import() works.
const { workerData, parentPort } = require('worker_threads');

async function run() {
  const { dataUri } = workerData;
  try {
    const mod = await import(dataUri);
    const plugin =
      mod.default ?? mod.plugin ?? mod;
    
    // We can't transfer class instances across threads — serialize what
    // the main thread needs to reconstruct the plugin.
    const isUnified =
      typeof plugin.run === 'function' &&
      typeof plugin.name === 'string';
    
    const isLegacy =
      typeof plugin.install === 'function' &&
      typeof plugin.meta === 'object';

    if (!isUnified && !isLegacy) {
      parentPort.postMessage({ error: 'Invalid plugin export shape' });
      return;
    }

    parentPort.postMessage({
      ok: true,
      kind: isUnified ? 'unified' : 'legacy',
      meta: isUnified
        ? { name: plugin.name, version: plugin.version, description: plugin.description }
        : plugin.meta,
    });
  } catch (err) {
    parentPort.postMessage({ error: String(err) });
  }
}

run();
