import { createOnigurumaEngine } from 'shiki/engine/oniguruma';
import onigWasmModule from 'shiki/onig.wasm';

export const engine = createOnigurumaEngine((imports) => WebAssembly.instantiate(onigWasmModule, imports));
