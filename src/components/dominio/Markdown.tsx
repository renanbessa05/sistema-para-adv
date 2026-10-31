"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown gerado pela IA ou pela advogada, renderizado sem HTML cru. */
export function Markdown({ texto, className, tamanho = "sm" }: { texto: string; className?: string; tamanho?: "sm" | "base" }) {
  return (
    <div className={`prose ${tamanho === "sm" ? "prose-sm" : "text-[15px]"} max-w-none dark:prose-invert ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{texto}</ReactMarkdown>
    </div>
  );
}
