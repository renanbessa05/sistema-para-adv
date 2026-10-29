import { createHash } from "node:crypto";

/** SHA-256 em hexadecimal do conteúdo (dedup de uploads e integridade). */
export function sha256Hex(dados: Uint8Array | ArrayBuffer | string): string {
  const h = createHash("sha256");
  h.update(typeof dados === "string" ? Buffer.from(dados, "utf8") : Buffer.from(dados instanceof ArrayBuffer ? new Uint8Array(dados) : dados));
  return h.digest("hex");
}
