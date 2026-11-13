import argparse
import json
import os
import secrets
import socket
import sys
import threading
from pathlib import Path

import uvicorn

from .api import create_app
from .backup import restore


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--asr-worker":
        from .asr import main as asr_main
        sys.argv.pop(1)
        asr_main()
        return
    if len(sys.argv) > 1 and sys.argv[1] == "--mcp":
        from .mcp_server import main as mcp_main
        sys.argv.pop(1)
        mcp_main()
        return
    parser = argparse.ArgumentParser()
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--restore", type=Path)
    parser.add_argument("--watch-parent", action="store_true")
    args = parser.parse_args()
    if args.restore:
        print(json.dumps(restore(args.restore, args.vault)))
        return
    token = os.environ.get("MIVO_CORE_TOKEN") or secrets.token_urlsafe(32)
    app = create_app(args.vault, token)
    sock = socket.socket()
    sock.bind(("127.0.0.1", args.port))
    sock.listen(128)
    port = sock.getsockname()[1]
    print(json.dumps({"mivo_core": True, "url": f"http://127.0.0.1:{port}", "token": token}), flush=True)
    server = uvicorn.Server(uvicorn.Config(app, log_level="warning", access_log=False))
    if args.watch_parent:
        def watch_parent():
            while sys.stdin.buffer.read(1024):
                pass
            server.should_exit = True
        threading.Thread(target=watch_parent, daemon=True).start()
    try:
        server.run(sockets=[sock])
    finally:
        sock.close()


if __name__ == "__main__":
    main()
