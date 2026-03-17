import type { PosizionamentiBridge } from "../../main/preload";

declare global {
  interface Window {
    posizionamenti: PosizionamentiBridge;
  }
}

export function getBridge(): PosizionamentiBridge {
  if (!window.posizionamenti) {
    throw new Error(
      "Bridge posizionamenti non disponibile (preload non caricato).",
    );
  }
  return window.posizionamenti;
}
