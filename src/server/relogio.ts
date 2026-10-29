import "server-only";
import { connection } from "next/server";

/** Instante atual para decidir vigência na renderização do servidor (a página é dinâmica por `connection`). */
export async function agoraServidor(): Promise<Date> {
  await connection();
  return new Date();
}
