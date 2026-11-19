import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { FormTrocarSenha } from "@/components/conta/FormTrocarSenha";

export default function TrocarSenhaPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-fg-1">Trocar senha</h1>
        <p className="mt-1 text-sm text-fg-3">
          Escolha uma senha só sua. Não precisa de e-mail nem de link.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nova senha</CardTitle>
        </CardHeader>
        <CardBody>
          <FormTrocarSenha />
        </CardBody>
      </Card>
    </div>
  );
}
