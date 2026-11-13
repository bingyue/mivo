import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import time
import zipfile
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / 'apps/desktop/src-tauri/resources'
LOCK = json.loads((ROOT / 'mivo/runtime-lock.json').read_text())
CACHE = ROOT / '.mivo-local/downloads'


def download(url, target, digest, headers=None):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and hashlib.file_digest(target.open('rb'), 'sha256').hexdigest() == digest:
        return
    stage = target.with_suffix('.partial')
    for attempt in range(6):
        offset = stage.stat().st_size if stage.exists() else 0
        try:
            with httpx.stream('GET', url, headers={**(headers or {}), **({'Range': f'bytes={offset}-'} if offset else {})},
                              follow_redirects=True, timeout=httpx.Timeout(30, read=45)) as response:
                response.raise_for_status()
                append = response.status_code == 206 and response.headers.get('content-range', '').startswith(f'bytes {offset}-')
                with stage.open('ab' if append else 'wb') as output:
                    for block in response.iter_bytes(1024 * 1024):
                        output.write(block)
            actual = hashlib.file_digest(stage.open('rb'), 'sha256').hexdigest()
            if actual != digest:
                stage.unlink(missing_ok=True)
                raise ValueError(f'CHECKSUM_MISMATCH: {target.name}')
            stage.replace(target)
            return
        except (httpx.HTTPError, ValueError):
            if attempt == 5:
                raise
            time.sleep(1)


def main():
    if os.environ.get('MIVO_DISTRIBUTION_MODE', 'personal_noncommercial') != 'personal_noncommercial':
        raise SystemExit('Commercial derivatives require separate upstream permission.')
    system = {'Darwin': 'macos', 'Windows': 'windows', 'Linux': 'linux'}[platform.system()]
    arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'x64'
    suffix = f'{system}-{arch}' if system == 'macos' or arch == 'arm64' else system
    name = f'deepseek-harness-pkg-{suffix}.asar.zip'
    asset = LOCK['assets'][name]
    archive = CACHE / name
    download(f"https://api.github.com/repos/dsh-tauri/deepseek-harness-pkg/releases/assets/{asset['id']}", archive,
             asset['sha256'], {'Accept': 'application/octet-stream'})
    target = RESOURCES / 'dsh'
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as package:
        for entry in package.infolist():
            if not (target / entry.filename).resolve().is_relative_to(target.resolve()):
                raise ValueError('UNSAFE_RUNTIME_ARCHIVE')
        package.extractall(target)
    pnpm = CACHE / 'pnpm-11.7.0.tgz'
    download('https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz', pnpm,
             'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee')
    with tempfile.TemporaryDirectory(dir=CACHE) as scratch:
        with tarfile.open(pnpm) as package:
            package.extractall(scratch, filter='data')
        shutil.copytree(Path(scratch) / 'package', RESOURCES / 'pnpm', dirs_exist_ok=True)
    subprocess.run(['node', str(ROOT / 'scripts/bundle-metadata.mjs'), '--manifest', '--platform', system, '--arch', arch], cwd=ROOT, check=True)
    print(f'Prepared pinned DSH {LOCK["dsh"]} and pnpm for {system}/{arch}; ASR models download only on user request')


if __name__ == '__main__':
    main()
