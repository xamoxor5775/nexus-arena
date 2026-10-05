export type AdsConfig = {
  id: string;
  purchase: string;
  checkout: string;
  amount: number;
};

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let config: AdsConfig | null = null;
let boot: Promise<AdsConfig | null> | null = null;

function ready(): boolean {
  return Boolean(config?.id.startsWith("AW-") && typeof window.gtag === "function");
}

export function adsConfig(): AdsConfig | null {
  return config;
}

export function bootGoogleAds(): Promise<AdsConfig | null> {
  if (boot) return boot;
  boot = (async () => {
    try {
      const response = await fetch("/api/ads/config", { cache: "no-store", signal: AbortSignal.timeout(4000) });
      const body = (await response.json().catch(() => ({}))) as Partial<AdsConfig>;
      const id = String(body.id || "").trim();
      if (!response.ok || !id.startsWith("AW-")) return null;
      config = {
        id,
        purchase: String(body.purchase || "").trim(),
        checkout: String(body.checkout || "").trim(),
        amount: Number(body.amount) > 0 ? Number(body.amount) : 1000,
      };
      window.dataLayer = window.dataLayer || [];
      // gtag.js only processes the real `arguments` object; pushing a plain array is ignored.
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments);
      } as Gtag;
      window.gtag("js", new Date());
      window.gtag("config", config.id);
      if (!document.querySelector(`script[src*="googletagmanager.com/gtag/js?id=${config.id}"]`)) {
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.id)}`;
        document.head.appendChild(script);
      }
      return config;
    } catch {
      return null;
    }
  })();
  return boot;
}

function fire(name: string, params: Record<string, unknown>) {
  if (!ready()) return;
  window.gtag?.("event", name, params);
}

function conversion(label: string, params: Record<string, unknown>) {
  if (!config?.id || !label || !ready()) return;
  window.gtag?.("event", "conversion", {
    send_to: `${config.id}/${label}`,
    ...params,
  });
}

/** Optional item for the checkout/purchase events (default: the legacy 30-day access). */
export type AdsItem = { value: number; id: string; name: string };

export function trackBeginCheckout(then: () => void, item?: AdsItem) {
  let sent = false;
  const go = () => {
    if (sent) return;
    sent = true;
    then();
  };
  window.setTimeout(go, 600);
  void bootGoogleAds().then((cfg) => {
    if (!cfg || !ready()) {
      go();
      return;
    }
    const value = item?.value ?? cfg.amount;
    fire("begin_checkout", {
      value,
      currency: "CLP",
      items: [item ? { item_id: item.id, item_name: item.name, price: item.value } : { item_id: "nexus-access-30d", item_name: "Acceso Nexus Arena 30 días" }],
      event_callback: go,
    });
    if (cfg.checkout) conversion(cfg.checkout, { value, currency: "CLP" });
  });
}

export function trackPurchase(orderId: string, item?: AdsItem) {
  const id = orderId.trim();
  if (!id) return;
  const key = `nexus-ads-purchase:${id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
  void bootGoogleAds().then((cfg) => {
    if (!cfg?.purchase) return;
    const params = { value: item?.value ?? cfg.amount, currency: "CLP", transaction_id: id };
    fire("purchase", item ? { ...params, items: [{ item_id: item.id, item_name: item.name, price: item.value }] } : params);
    conversion(cfg.purchase, params);
  });
}

export function trackEnterArena(method = "access_key") {
  void bootGoogleAds().then((cfg) => {
    if (!cfg) return;
    fire("login", { method });
  });
}
