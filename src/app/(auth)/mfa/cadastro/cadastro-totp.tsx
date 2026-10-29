"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { criarClienteBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { Alert, Skeleton } from "@/components/ui/alert";

type Etapa = { tipo: "gerando" } | { tipo: "pronto"; fatorId: string; qrCode: string; segredo: string } | { tipo: "falhou"; mensagem: string };

/** O Supabase devolve o QR como SVG em data URI; se vier só o SVG, monta o data URI. */
function qrComoUrl(qr: string): string {
  return qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
}

function nomeDoFator(): string {
  const agora = new Date();
  const data = agora.toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
  const hora = agora.toLocaleTimeString("pt-BR", { timeZone: "America/Cuiaba", hour: "2-digit", minute: "2-digit" });
  return `Autenticador ${data} ${hora}`;
}

export function CadastroTotp({ voltar, email, podeCancelar }: { voltar: string; email: string; podeCancelar: boolean }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>({ tipo: "gerando" });
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarSegredo, setMostrarSegredo] = useState(false);
  const iniciou = useRef(false);

  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;
    (async () => {
      const supabase = criarClienteBrowser();
      // Fatores que ficaram pela metade (QR gerado e nunca confirmado) só poluem a lista: tenta limpar, sem travar se não der.
      const { data: existentes } = await supabase.auth.mfa.listFactors();
      for (const f of existentes?.all ?? []) {
        if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", issuer: "Assistente Jurídica", friendlyName: nomeDoFator() });
      if (error || !data) {
        setEtapa({ tipo: "falhou", mensagem: `Não foi possível iniciar o cadastro: ${error?.message ?? "resposta vazia"}. Confira se o TOTP está habilitado no Supabase (docs/deploy.md).` });
        return;
      }
      setEtapa({ tipo: "pronto", fatorId: data.id, qrCode: qrComoUrl(data.totp.qr_code), segredo: data.totp.secret });
    })();
  }, []);

  async function verificar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (etapa.tipo !== "pronto") return;
    const code = codigo.replace(/\D/g, "");
    if (code.length !== 6) {
      setErro("Digite os 6 dígitos mostrados no aplicativo.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const supabase = criarClienteBrowser();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: etapa.fatorId, code });
      if (error) {
        setErro("Código não confere. Espere o próximo código do aplicativo e tente de novo.");
        return;
      }
      router.push(voltar);
      router.refresh();
    } finally {
      setEnviando(false);
    }
  }

  if (etapa.tipo === "gerando") {
    return (
      <div className="flex flex-col items-center gap-3" aria-busy="true" aria-label="Gerando QR code">
        <Skeleton className="h-48 w-48" />
        <p className="text-sm text-zinc-500">Gerando o QR code…</p>
      </div>
    );
  }

  if (etapa.tipo === "falhou") {
    return (
      <div className="flex flex-col gap-3">
        <Alert tom="perigo">{etapa.mensagem}</Alert>
        <Button type="button" variante="contorno" onClick={() => router.refresh()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={verificar}>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
        <li>Abra o aplicativo autenticador e escolha adicionar uma conta.</li>
        <li>
          Aponte a câmera para o QR code abaixo (conta <span className="font-medium">{email}</span>).
        </li>
        <li>Digite o código de 6 dígitos que aparecer para confirmar.</li>
      </ol>
      <div className="flex justify-center rounded-md border border-zinc-200 bg-white p-2 dark:border-zinc-700">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG em data URI gerado pelo Auth; não passa pelo otimizador */}
        <img src={etapa.qrCode} alt="QR code para cadastrar o autenticador" width={192} height={192} className="h-48 w-48" />
      </div>
      <div className="text-xs text-zinc-500">
        Não consegue ler o QR code?{" "}
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setMostrarSegredo((v) => !v)}>
          {mostrarSegredo ? "Esconder a chave" : "Digitar a chave manualmente"}
        </button>
        {mostrarSegredo ? (
          <code className="mt-1 block select-all break-all rounded bg-zinc-100 px-2 py-1 font-mono text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100" aria-label="Chave secreta">
            {etapa.segredo}
          </code>
        ) : null}
      </div>
      {erro ? <Alert tom="perigo">{erro}</Alert> : null}
      <Campo label="Código de 6 dígitos">
        <Input
          name="codigo"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={6}
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
          placeholder="000000"
          className="text-center text-lg tracking-widest"
        />
      </Campo>
      <div className="flex gap-2">
        {podeCancelar ? (
          <Button type="button" variante="contorno" className="flex-1" onClick={() => router.push(voltar)}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" className="flex-1" disabled={enviando || codigo.length !== 6}>
          {enviando ? "Verificando…" : "Confirmar e ativar"}
        </Button>
      </div>
    </form>
  );
}
