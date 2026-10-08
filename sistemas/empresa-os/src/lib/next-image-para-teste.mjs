// SÓ PARA OS TESTES. Substituto do next/image: o Node não faz o `import Image from "next/image"` entregar o
// componente (o pacote é CommonJS com `default` dentro de um objeto), então o carregador de teste troca o
// módulo por este, que só desenha o <img>.
import { createElement } from "react";

export default function Image({ src, alt = "", width, height, className }) {
  return createElement("img", { src, alt, width, height, className });
}
