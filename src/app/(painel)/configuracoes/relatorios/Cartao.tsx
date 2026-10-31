import { Card, CardContent } from "@/components/ui/card";

/** Indicador de uma linha: título discreto e valor grande. Compartilhado pelas abas de Relatórios. */
export function Cartao({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-sm text-zinc-500">{titulo}</p>
        <p className="text-3xl font-semibold">{valor}</p>
      </CardContent>
    </Card>
  );
}
