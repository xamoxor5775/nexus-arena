import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { LandingPage } from "@/components/landing-page";
import { NexusApp } from "@/components/nexus-app";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [entered, setEntered] = useState(false);
  const [checking, setChecking] = useState(true);
  const grantAccess = useCallback(() => setEntered(true), []);

  useEffect(() => {
    fetch("/api/access/me", { credentials: "same-origin", cache: "no-store" })
      .then((response) => { if (response.ok) setEntered(true); })
      .finally(() => setChecking(false));
  }, []);

  if (checking) return <div className="access-checking">VERIFICANDO ACCESO…</div>;
  return entered ? <NexusApp autoStart /> : <LandingPage onAccessGranted={grantAccess} />;
}
