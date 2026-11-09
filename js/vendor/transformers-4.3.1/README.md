Vendored so the on-device AI works without any CDN:

- `transformers.min.js` – @huggingface/transformers 4.3.1 (Apache-2.0), browser build with ONNX Runtime bundled.
  One edit: the class name `Mistral3ForConditional…Generation` is spelled as a concatenation (and its unused
  re-export dropped) because GitHub push protection mistakes the 32-letter name for a Mistral API key.
- `ort-wasm-simd-threaded.asyncify.mjs` / `.wasm` – onnxruntime-web 1.31.0-dev.20260914 (MIT), the WebGPU backend transformers.js loads

The service worker caches these on first use in a cache that survives app updates (`ccnaq-ai`),
so they are not part of the normal precache.
