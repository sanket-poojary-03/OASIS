"""UrllibTransport: httpx requests sent through urllib (Sketchfab's bot filter turns httpx's own connections away)."""
import gzip
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from app.asset_sources import SketchfabFinder, UrllibTransport, stream_to_file


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def do_GET(self):
        if self.path.startswith("/json"):
            body = json.dumps({"auth": self.headers.get("Authorization"), "path": self.path}).encode()
            self._send(200, body, "application/json")
        elif self.path == "/gzip":
            self._send(200, gzip.compress(b'{"ok": true}'), "application/json", {"Content-Encoding": "gzip"})
        elif self.path == "/big":
            self._send(200, b"x" * 4000, "model/gltf-binary")
        elif self.path == "/moved":
            self._send(302, b"", "text/plain", {"Location": "/json?moved=1"})
        else:
            self._send(404, b'{"detail": "no"}', "application/json")

    def _send(self, status, body, ctype, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)


@pytest.fixture(scope="module")
def server():
    s = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
    threading.Thread(target=s.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{s.server_address[1]}"
    s.shutdown()


def test_json_params_and_headers_arrive(server):
    with httpx.Client(transport=UrllibTransport()) as c:
        r = c.get(f"{server}/json", params={"q": "plane wreck"}, headers={"Authorization": "Token t"})
    assert r.status_code == 200
    assert r.json() == {"auth": "Token t", "path": "/json?q=plane+wreck"}


def test_gzip_is_decoded(server):
    with httpx.Client(transport=UrllibTransport()) as c:
        assert c.get(f"{server}/gzip").json() == {"ok": True}


def test_errors_come_back_as_responses_so_raise_for_status_works(server):
    with httpx.Client(transport=UrllibTransport()) as c:
        r = c.get(f"{server}/missing")
    assert r.status_code == 404
    with pytest.raises(httpx.HTTPStatusError):
        r.raise_for_status()


def test_redirects_are_followed(server):
    with httpx.Client(transport=UrllibTransport(), follow_redirects=True) as c:
        assert c.get(f"{server}/moved").json()["path"] == "/json?moved=1"


def test_streamed_download_keeps_the_size_cap(server, tmp_path):
    with httpx.Client(transport=UrllibTransport()) as c:
        stream_to_file(c, f"{server}/big", tmp_path / "a.glb", cap=5000)
        assert (tmp_path / "a.glb").stat().st_size == 4000
        with pytest.raises(ValueError):
            stream_to_file(c, f"{server}/big", tmp_path / "b.glb", cap=100)
    assert not (tmp_path / "b.glb").exists()


def test_unreachable_host_raises_an_httpx_error():
    with httpx.Client(transport=UrllibTransport(), timeout=2) as c, pytest.raises(httpx.TransportError):
        c.get("http://127.0.0.1:1/")


def test_sketchfab_goes_through_urllib_by_default():
    assert isinstance(SketchfabFinder("t").transport, UrllibTransport)


def test_sketchfab_search_lets_relevance_rank_and_drops_heavy_models_itself():
    # Sketchfab's max_face_count filter throws relevance away (a "wrecked plane" search returned a condiment jar), so
    # the finder asks for a wide page, unfiltered, and keeps the light ones in their ranked order.
    seen = {}

    def handler(req: httpx.Request) -> httpx.Response:
        seen.update(req.url.params)
        return httpx.Response(200, json={"results": [
            {"name": f"m{i}", "uid": f"u{i}", "license": {"label": "CC0"}, "faceCount": 90000 if i % 2 else 2000} for i in range(24)]})

    out = SketchfabFinder("t", transport=httpx.MockTransport(handler)).search("crashed airplane", limit=8)
    assert "max_face_count" not in seen and seen["count"] == "24" and seen["q"] == "crashed airplane"
    assert [c.title for c in out] == [f"m{i}" for i in range(0, 16, 2)]
