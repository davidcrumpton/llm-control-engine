export async function run() {
  const { x } = await import('./test-esbuild-dep.js');
  console.log(x);
}
