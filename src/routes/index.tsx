import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { LandingPage } from "@/components/landing-page";
import { NexusApp } from "@/components/nexus-app";
import { trackEnterArena } from "@/lib/google-ads";

// Only loaded when coming back from a skin purchase (/?skins_order=…).
const SkinsReceipt = lazy(() => import("@/skins/receipt").then((m) => ({ default: m.SkinsReceipt })));

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [entered, setEntered] = useState(false);
  const [checking, setChecking] = useState(true);
  const [demo, setDemo] = useState(false);
  const [joining, setJoining] = useState(false);
  const [skinsOrder, setSkinsOrder] = useState<string | null>(null);
  const grantAccess = useCallback(() => setEntered(true), []);
  // Free online play: a signed guest session (same cookie as the old paid key) opens /api/rtc.
  // If the server can't issue it, fall back to free offline play so nobody is ever blocked.
  const playFree = useCallback(() => {
    if (joining) return;
    setJoining(true);
    setSkinsOrder(null);
    fetch("/api/access/guest", { method: "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(6000) })
      .then((response) => {
        if (!response.ok) throw new Error(`guest ${response.status}`);
        trackEnterArena("free");
        setEntered(true);
      })
      .catch(() => setDemo(true))
      .finally(() => setJoining(false));
  }, [joining]);
  // Free offline play vs bots (no signaling), every arena, no time limit.
  const startOffline = useCallback(() => {
    setSkinsOrder(null);
    setDemo(true);
  }, []);
  const exitDemo = useCallback(() => setDemo(false), []);

  useEffect(() => {
    const order = new URLSearchParams(window.location.search).get("skins_order");
    if (order) setSkinsOrder(order);
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    fetch("/api/access/me", { credentials: "same-origin", cache: "no-store", signal: ctrl.signal })
      .then((response) => {
        // Paid keys enter straight away, as before (not when a purchase receipt has to be shown first).
        if (response.ok && !order) setEntered(true);
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
        CARGANDO ARENA…
      </div>
    );
  }
  if (entered) return <NexusApp />;
  if (demo) return <NexusApp demo={{ onExit: exitDemo }} />;
  return (
    <>
      <LandingPage onAccessGranted={grantAccess} onPlayFree={playFree} onStartOffline={startOffline} joining={joining} />
      {skinsOrder && (
        <Suspense fallback={null}>
          <SkinsReceipt order={skinsOrder} onPlay={playFree} onClose={() => setSkinsOrder(null)} />
        </Suspense>
      )}
    </>
  );
}
