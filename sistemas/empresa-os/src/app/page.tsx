import { redirect } from "next/navigation";

// A raiz sempre manda pro painel; quem não tem sessão é redirecionado
// pra /login pelo middleware.
export default function Raiz() {
  redirect("/inicio");
}
