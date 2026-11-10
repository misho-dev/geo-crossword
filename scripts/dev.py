#!/usr/bin/env python3
"""Local static preview; accepts common preview-host command line flags."""
import argparse, functools
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--host',default='127.0.0.1');parser.add_argument('--port',type=int,default=8000);parser.add_argument('--strictPort',action='store_true');args=parser.parse_args()
handler=functools.partial(SimpleHTTPRequestHandler,directory=str(Path(__file__).resolve().parents[1]))
print(f'Serving at http://{args.host}:{args.port}',flush=True)
ThreadingHTTPServer((args.host,args.port),handler).serve_forever()
