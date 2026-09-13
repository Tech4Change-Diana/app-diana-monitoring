/**
 * DIANA — Seleção do `StateStore` conforme `STATE_BACKEND`.
 */
import type { AppConfig } from "../config/index.js";
import type { StateStore } from "./StateStore.js";
import { FileStateStore } from "./fileStateStore.js";

export function createStateStore(config: AppConfig): StateStore {
  switch (config.stateBackend) {
    case "file":
      return new FileStateStore(config.state.dir);
    case "oci":
      // OciObjectStorageStore chega no próximo PR (usa oci-sdk).
      throw new Error(
        "STATE_BACKEND=oci ainda não implementado neste repositório. Use STATE_BACKEND=file " +
          "(o adaptador OCI Object Storage chega em um PR seguinte).",
      );
    default:
      return new FileStateStore(config.state.dir);
  }
}

export type { StateStore } from "./StateStore.js";
export * from "./checkpoint.js";
export { FileStateStore } from "./fileStateStore.js";
