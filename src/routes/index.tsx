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
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    fetch("/api/access/me", { credentials: "same-origin", cache: "no-store", signal: ctrl.signal })
      .then((response) => {
        if (response.ok) setEntered(true);
      })
      .catch(() => undefined)
      .finally(() => {
        window.clearTimeout(timer);
        setChecking(false);
      });
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  if (checking) {
    return (
      <div className="access-checking">
        <span className="landing-brand-mark" aria-hidden="true"><b>N</b><i /></span>
        VERIFICANDO ACCESO…
      </div>
    );
  }
  return entered ? <NexusApp /> : <LandingPage onAccessGranted={grantAccess} />;
}
