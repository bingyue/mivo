import argparse
import hashlib
import json
import os
import queue
import subprocess
import threading
import time
from pathlib import Path

import httpx

parser = argparse.ArgumentParser()
parser.add_argument('--binary', required=True, type=Path)
parser.add_argument('--audio', required=True, type=Path)
parser.add_argument('--model', required=True, type=Path)
parser.add_argument('--vault', required=True, type=Path)
parser.add_argument('--report', required=True, type=Path)
args = parser.parse_args()
args.vault.parent.mkdir(parents=True, exist_ok=True)
with args.vault.with_suffix('.log').open('w') as errors:
    process = subprocess.Popen([str(args.binary.resolve()), '--vault', str(args.vault.resolve())],
                               stdout=subprocess.PIPE, stderr=errors, text=True)
    try:
        handshake = queue.Queue()
        threading.Thread(target=lambda: handshake.put(process.stdout.readline()), daemon=True).start()
        connection = json.loads(handshake.get(timeout=30))
        client = httpx.Client(base_url=connection['url'], headers={'Authorization': f"Bearer {connection['token']}"}, timeout=30)
        def request(method, path, **kwargs):
            response = client.request(method, path, **kwargs)
            response.raise_for_status()
            return response.json()
        health = request('GET', '/health')
        with args.audio.open('rb') as stream:
            source = request('POST', '/sources/upload', files={'file': (args.audio.name, stream, 'audio/wav')})
        job = request('POST', f"/sources/{source['id']}/transcribe", json={'provider': 'whisper', 'model_path': str(args.model.resolve()), 'device': 'cpu'})
        deadline = time.monotonic() + 180
        while time.monotonic() < deadline:
            current = next(row for row in request('GET', '/jobs') if row['id'] == job['id'])
            if current['status'] in {'completed', 'failed'}:
                break
            time.sleep(.5)
        assert current['status'] == 'completed', current
        transcript = request('GET', f"/sources/{source['id']}/transcript")
        assert 'ask not what your country can do for you' in transcript['text'].lower(), transcript['text']
        assert transcript['segments'][-1]['end'] >= 10
        assert request('GET', '/memories') == []
        original = client.get(f"/sources/{source['id']}/original")
        original.raise_for_status()
        digest = hashlib.sha256(args.audio.read_bytes()).hexdigest()
        assert hashlib.sha256(original.content).hexdigest() == digest
        report = {'kind': 'real-frozen-core-local-ASR', 'audio_sha256': digest, 'hardware': health['hardware'],
                  'decoder': health['audio_decoder'], 'engine': 'faster-whisper CPU int8',
                  'source_id': source['id'], 'transcript': transcript['text'], 'segments': transcript['segments'],
                  'cloud_called': False, 'automatic_memory_written': False}
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({key: report[key] for key in ['kind', 'transcript', 'cloud_called']}, ensure_ascii=False))
    finally:
        process.terminate()
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
