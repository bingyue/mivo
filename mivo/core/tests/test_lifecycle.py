import json
import os
import subprocess
import sys
import time

import httpx
import pytest


@pytest.mark.parametrize("mode", ["personal_noncommercial", "commercial"])
def test_standalone_core_starts_and_exits_with_parent_in_both_modes(tmp_path, mode):
    process = subprocess.Popen([sys.executable, "-m", "mivo_core", "--vault", str(tmp_path / "vault"),
                                "--watch-parent"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True,
                               env={**os.environ, "MIVO_DISTRIBUTION_MODE": mode})
    try:
        handshake = json.loads(process.stdout.readline())
        deadline = time.monotonic() + 5
        while True:
            try:
                response = httpx.get(handshake["url"] + "/health",
                    headers={"Authorization": "Bearer " + handshake["token"]}, timeout=.5)
                assert response.status_code == 200
                break
            except httpx.TransportError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(.05)
        process.stdin.close()
        assert process.wait(timeout=15) == 0
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
