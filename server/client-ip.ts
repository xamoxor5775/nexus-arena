import { getRequestIP, type H3Event } from "h3";
import { clientIpFromHeaders } from "../src/lib/client-ip";

/** Rate-limit key: X-Real-IP (set by nginx), else the LAST X-Forwarded-For entry, else the socket address. */
export function clientIp(event: H3Event): string {
  return clientIpFromHeaders(event.req.headers, getRequestIP(event));
}
