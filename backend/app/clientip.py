"""The client address used by every rate limiter (m1).

uvicorn no longer trusts X-Forwarded-For from any peer (its `--forwarded-allow-ips='*'` took the LEFTMOST entry, which
the client writes itself, so per-IP limits could be dodged by sending a fake header). Proxies append to the header, so
the app reads it from the RIGHT: the rightmost entry is the address that Render's edge saw. Render's edge is
Cloudflare, so trailing Cloudflare (and private, internal) hops are skipped too; otherwise every visitor would share a
Cloudflare edge address and one limit. The first entry from the right that is neither is the client.
"""
from __future__ import annotations

import ipaddress

# https://www.cloudflare.com/ips-v4 and /ips-v6 (fetched 2026-11-02).
CLOUDFLARE = tuple(ipaddress.ip_network(n) for n in (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
    "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29",
    "2c0f:f248::/32",
))


def _proxy(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    """A hop of the hosting chain, not a visitor: Cloudflare, or a private/loopback address inside the platform."""
    return ip.is_private or ip.is_loopback or ip.is_link_local or any(ip in net for net in CLOUDFLARE)


def client_ip(forwarded_for: str | None, peer: str | None) -> str:
    """Rightmost X-Forwarded-For entry that is not a proxy hop; the socket peer when there is no header."""
    hops = [h.strip() for h in (forwarded_for or "").split(",") if h.strip()]
    for hop in reversed(hops):
        try:
            ip = ipaddress.ip_address(hop)
        except ValueError:
            return hop[:64]  # not an address: whatever is left of the trusted hops is the client's own text
        if not _proxy(ip):
            return str(ip)
    return hops[0][:64] if hops else (peer or "unknown")
