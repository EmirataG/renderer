import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

let modulePromise: Promise<any> | null = null;
let resolvedModule: any = null;

function ensureModule(): Promise<any> {
  if (resolvedModule) return Promise.resolve(resolvedModule);
  if (!modulePromise) {
    modulePromise = createVerovioModule().then((mod) => {
      resolvedModule = mod;
      return mod;
    });
  }
  return modulePromise;
}

export async function createToolkit(): Promise<VerovioToolkit> {
  const mod = await ensureModule();
  return new VerovioToolkit(mod);
}

export const isReady: Promise<void> = ensureModule().then(() => {});
