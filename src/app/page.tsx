import { EntraAuthGate } from "@/components/auth/EntraAuthGate";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <EntraAuthGate>
      <AppShell />
    </EntraAuthGate>
  );
}
