"""Serve the built site from dist/ (used on Railway). Standard library only.

Usage:  python serve.py            # listens on $PORT, default 8000
"""

import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

DIST = Path(__file__).parent / "dist"


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Asset URLs carry a content hash (?v=...), so they can be cached for a long time; pages should revalidate.
        if self.path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "public, max-age=300")
        super().end_headers()

    def send_error(self, code, message=None, explain=None):
        page = DIST / "404.html"
        if code == 404 and page.exists():
            body = page.read_bytes()
            self.send_response(404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        super().send_error(code, message, explain)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {fmt % args}", flush=True)


def main():
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer(("0.0.0.0", port), partial(Handler, directory=str(DIST)))
    print(f"Serving {DIST} on port {port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
