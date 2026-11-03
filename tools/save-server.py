#!/usr/bin/env python3
"""A tiny local server that lets tools/export-house.html write model files
into the repo: it saves whatever's POSTed to /save?path=models/... (or
house.json). Run it from the repo while you export:

    python3 tools/save-server.py

It only listens on this machine and only writes models/ and house.json.
"""
import http.server, os, sys, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8126


class Save(http.server.BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', '*')

    def do_OPTIONS(self):
        self.send_response(204); self.cors(); self.end_headers()

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        rel = os.path.normpath(q.get('path', [''])[0])
        if not (rel == 'house.json' or rel.startswith('models' + os.sep)) or '..' in rel:
            self.send_response(403); self.cors(); self.end_headers(); return
        dest = os.path.join(ROOT, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'wb') as f:
            f.write(self.rfile.read(int(self.headers['Content-Length'])))
        self.send_response(200); self.cors(); self.end_headers(); self.wfile.write(b'ok')

    def log_message(self, *a):
        pass


print(f'saving into {ROOT} on http://127.0.0.1:{PORT}')
http.server.HTTPServer(('127.0.0.1', PORT), Save).serve_forever()
