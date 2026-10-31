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

function Passo({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full bg-marca-50 text-[11px] font-extrabold text-marca-700 tabular-nums" aria-hidden>
        {n}
      </span>
      <span className="min-w-0 leading-snug">{children}</span>
    </li>
  );
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
      <div className="flex flex-col items-center gap-3 py-2" aria-busy="true" aria-label="Gerando QR code">
        <Skeleton className="h-48 w-48 rounded-xl" />
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
    <form className="flex flex-col gap-4" onSubmit={verificar}>
      <ol className="flex flex-col gap-2 text-sm text-zinc-700">
        <Passo n={1}>Abra o aplicativo autenticador e escolha adicionar uma conta.</Passo>
        <Passo n={2}>
          Aponte a câmera para o QR code abaixo (conta <span className="font-semibold text-zinc-900">{email}</span>).
        </Passo>
        <Passo n={3}>Digite o código de 6 dígitos que aparecer para confirmar.</Passo>
      </ol>
      <div className="flex justify-center rounded-2xl border border-zinc-200 bg-white p-3 shadow-xs">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG em data URI gerado pelo Auth; não passa pelo otimizador */}
        <img src={etapa.qrCode} alt="QR code para cadastrar o autenticador" width={192} height={192} className="h-48 w-48 rounded-lg" />
      </div>
      <div className="text-xs text-zinc-500">
        Não consegue ler o QR code?{" "}
        <button type="button" className="font-semibold text-marca-600 underline-offset-2 hover:underline" onClick={() => setMostrarSegredo((v) => !v)}>
          {mostrarSegredo ? "Esconder a chave" : "Digitar a chave manualmente"}
        </button>
        {mostrarSegredo ? (
          <code className="mt-2 block rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-[13px] leading-relaxed break-all text-zinc-900 select-all" aria-label="Chave secreta">
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
          className="h-14 text-center font-mono text-2xl font-semibold tracking-[0.4em] tabular-nums placeholder:tracking-[0.4em] placeholder:text-zinc-300"
        />
      </Campo>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        {podeCancelar ? (
          <Button type="button" variante="contorno" tamanho="lg" className="flex-1" onClick={() => router.push(voltar)}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" tamanho="lg" className="flex-1" disabled={enviando || codigo.length !== 6}>
          {enviando ? "Verificando…" : "Confirmar e ativar"}
        </Button>
      </div>
    </form>
  );
}
