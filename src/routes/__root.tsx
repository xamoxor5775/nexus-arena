import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { debugSpool } from "@/lib/debug-spool";
import { bootGoogleAds } from "@/lib/google-ads";
import appCss from "../styles.css?url";
import landingCss from "../landing.css?url";

const APP_NAME = "NEXUS ARENA";
const APP_URL = "https://nexusarena.cl/";
const APP_DESC =
  "FPS deathmatch gratis en el navegador. Juega online o contra bots, sin instalar. Cinco armas, bots letales y arena industrial.";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content",
      },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { title: "Nexus Arena · FPS deathmatch en el navegador" },
      { name: "description", content: APP_DESC },
      { name: "theme-color", content: "#08090b" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "es_CL" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:title", content: "Nexus Arena · Retroceder nunca, rendirse jamás" },
      { property: "og:description", content: APP_DESC },
      { property: "og:url", content: APP_URL },
      { property: "og:image", content: "https://nexusarena.cl/media/nexus-arena-demo-poster.jpg" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Nexus Arena · FPS en el navegador" },
      { name: "twitter:description", content: APP_DESC },
    ],
    links: [
      { rel: "canonical", href: APP_URL },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "stylesheet", href: landingCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  component: RootShell,
});

function RootShell() {
  useEffect(() => {
    debugSpool.install();
    void bootGoogleAds();
  }, []);
  return (
    <html lang="es-CL" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
