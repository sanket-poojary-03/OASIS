from fastapi.testclient import TestClient

from app.clientip import client_ip
from app.main import cors_origins, create_app
from app.ratelimit import RateLimiter


def test_rightmost_forwarded_entry_wins_over_client_supplied_ones():
    assert client_ip("81.2.69.160", "10.0.0.2") == "81.2.69.160"
    assert client_ip("1.1.1.1, 81.2.69.160", "10.0.0.2") == "81.2.69.160"  # leftmost is the client's own text
    assert client_ip(" 6.6.6.6 ,  7.7.7.7,81.2.69.160 ", None) == "81.2.69.160"


def test_cloudflare_and_private_hops_are_skipped():
    assert client_ip("1.1.1.1, 81.2.69.160, 172.70.4.5", "10.0.0.2") == "81.2.69.160"  # Cloudflare edge appended last
    assert client_ip("81.2.69.160, 162.158.1.1, 10.1.2.3", None) == "81.2.69.160"
    assert client_ip("2a02:c7f::1, 2606:4700::1111", None) == "2a02:c7f::1"
    assert client_ip("10.0.0.7", "10.0.0.2") == "10.0.0.7"  # only hops: the first one


def test_mapped_and_non_global_hops_are_skipped():
    assert client_ip("81.2.69.160, ::ffff:172.70.4.5", None) == "81.2.69.160"  # IPv4-mapped Cloudflare edge
    assert client_ip("81.2.69.160, ::ffff:10.0.0.3", None) == "81.2.69.160"  # IPv4-mapped internal hop
    assert client_ip("81.2.69.160, 100.64.0.9", None) == "81.2.69.160"  # shared (CGNAT) platform address
    assert client_ip("::ffff:81.2.69.160", None) == "81.2.69.160"  # a mapped visitor shares the plain address's budget


def test_no_header_uses_the_socket_peer_and_garbage_is_bounded():
    assert client_ip(None, "127.0.0.1") == "127.0.0.1"
    assert client_ip("", None) == "unknown"
    assert client_ip("x" * 500, None) == "x" * 64


def test_limits_follow_the_rightmost_hop_not_a_spoofed_leftmost_one(tmp_path):
    client = TestClient(create_app(llm=None, limiter=RateLimiter(per_ip=1)))

    def world(xff: str) -> int:
        return client.post("/api/world", json={"prompt": "a valley"}, headers={"x-forwarded-for": xff}).status_code

    # 503: no LLM here, but the request got past the limiter (429 is the limiter's answer).
    assert world("1.1.1.1, 81.2.69.160") == 503
    assert world("2.2.2.2, 81.2.69.160") == 429  # a new fake leftmost entry does not buy a new budget
    assert world("81.2.69.161") == 503  # a different visitor has their own


def test_cors_origins_are_stripped_and_empties_dropped(tmp_path, monkeypatch):
    assert cors_origins(" https://a.example , ,https://b.example ,") == ["https://a.example", "https://b.example"]
    assert cors_origins(None) == ["*"] and cors_origins(" , ") == ["*"]
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example, https://b.example")
    client = TestClient(create_app(llm=None))
    pre = {"access-control-request-method": "POST"}
    assert client.options("/api/world", headers={"origin": "https://b.example", **pre}).headers.get("access-control-allow-origin") == "https://b.example"
    assert "access-control-allow-origin" not in client.options("/api/world", headers={"origin": "https://evil.example", **pre}).headers
