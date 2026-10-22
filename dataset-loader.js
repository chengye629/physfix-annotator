export async function loadDataset(fetchData = (...args) => fetch(...args), Decompress = globalThis.DecompressionStream) {
  if (Decompress) {
    try {
      const packed = await fetchData('./data/physfixbench_physion300.jsonl.gz');
      if (packed.ok && packed.body) return await new Response(packed.body.pipeThrough(new Decompress('gzip'))).text();
    } catch { /* Older browsers and failed compressed requests use the source. */ }
  }
  const source = await fetchData('./data/physfixbench_physion300.jsonl');
  if (!source.ok) throw new Error(`数据请求失败 (${source.status})`);
  return source.text();
}
