import { OperatorPanel } from "@/features/ops/operator-panel";
export default function OperatorPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-8">
      <h1 className="realm-title text-3xl">Operator tools</h1>
      <p className="text-sm text-muted-foreground">
        Authorized operators only. An access token is required for every action.
      </p>
      <OperatorPanel />
    </main>
  );
}
