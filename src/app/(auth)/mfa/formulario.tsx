"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export function FormularioDesafio({ fatores, voltar }: { fatores: { id: string; nome: string }[]; voltar: string }) {
  const router = useRouter();
  const [fatorId, setFatorId] = useState(fatores[0]?.id ?? "");
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function verificar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = codigo.replace(/\D/g, "");
    if (code.length !== 6) {
      setErro("Digite os 6 dígitos mostrados no aplicativo.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const supabase = criarClienteBrowser();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code });
      if (error) {
        setErro("Código inválido ou expirado. Confira o relógio do celular e tente de novo.");
        return;
      }
      router.push(voltar);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={verificar}>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      {fatores.length > 1 ? (
        <Campo label="Autenticador">
          <Select value={fatorId} onChange={(e) => setFatorId(e.target.value)}>
            {fatores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </Campo>
      ) : null}
      <Campo label="Código de 6 dígitos">
        <Input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="text-center text-lg tracking-widest"
        />
      </Campo>
      <Button type="submit" disabled={enviando || codigo.length !== 6}>
        {enviando ? "Verificando…" : "Confirmar"}
      </Button>
    </form>
  );
}
