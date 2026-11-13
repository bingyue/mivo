import hashlib
import json
import shutil
import sqlite3
import stat
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from .vault import Vault, uid


def backup(vault: Vault):
    vault.writable()
    relative = f"backups/mivo-{uid()}.zip"
    with vault.lock, tempfile.TemporaryDirectory() as scratch:
        snapshot = Path(scratch) / "mivo.sqlite"
        with vault.db.connect() as source:
            target = sqlite3.connect(snapshot)
            try:
                source.backup(target)
            finally:
                target.close()
        files = [(snapshot, "database/mivo.sqlite")]
        for directory in ("originals", "transcripts", "knowledge"):
            for path in vault.path(directory).rglob("*"):
                if path.is_symlink():
                    raise ValueError("BACKUP_SYMLINK_FORBIDDEN")
                if path.is_file():
                    files.append((path, path.relative_to(vault.root).as_posix()))
        manifest = {}
        with zipfile.ZipFile(vault.path(relative), "w", zipfile.ZIP_DEFLATED) as archive:
            for path, name in files:
                with path.open("rb") as stream:
                    manifest[name] = hashlib.file_digest(stream, "sha256").hexdigest()
                archive.write(path, name)
            archive.writestr("manifest.json", json.dumps({"schema": 1, "files": manifest}))
    return {"path": relative, "files": len(files)}


def restore(archive_path: Path, destination: Path):
    destination = destination.expanduser().resolve()
    if destination.exists() and any(destination.iterdir()):
        raise ValueError("RESTORE_REQUIRES_EMPTY_DESTINATION")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as scratch:
        staging = Path(scratch)
        with zipfile.ZipFile(archive_path) as archive:
            names = set()
            total = 0
            for info in archive.infolist():
                path = PurePosixPath(info.filename)
                total += info.file_size
                mode = info.external_attr >> 16
                if (path.is_absolute() or ".." in path.parts or "\\" in info.filename or ":" in info.filename
                        or info.filename in names or stat.S_ISLNK(mode) or total > 20 * 1024**3):
                    raise ValueError("UNSAFE_BACKUP")
                if info.filename != "manifest.json" and path.parts[0] not in {
                    "originals", "transcripts", "knowledge", "database"
                }:
                    raise ValueError("UNEXPECTED_BACKUP_PATH")
                names.add(info.filename)
            manifest = json.loads(archive.read("manifest.json"))
            if manifest["schema"] != 1 or set(manifest["files"]) != names - {"manifest.json"}:
                raise ValueError("INVALID_BACKUP_MANIFEST")
            archive.extractall(staging)
        for name, expected in manifest["files"].items():
            with (staging / name).open("rb") as stream:
                actual = hashlib.file_digest(stream, "sha256").hexdigest()
            if actual != expected:
                raise ValueError("BACKUP_CHECKSUM_MISMATCH")
        with sqlite3.connect(staging / "database/mivo.sqlite") as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("BACKUP_DATABASE_CORRUPT")
        candidate = Vault(staging, readonly=True)
        for source in candidate.rows("SELECT * FROM sources"):
            path = candidate.path(source["original"])
            with path.open("rb") as stream:
                if hashlib.file_digest(stream, "sha256").hexdigest() != source["sha256"]:
                    raise ValueError("BACKUP_SOURCE_MISMATCH")
        destination.mkdir(exist_ok=True)
        for path in staging.iterdir():
            if path.name != "manifest.json":
                shutil.move(str(path), destination / path.name)
        restored = Vault(destination)
        for path in restored.path("originals").iterdir():
            path.chmod(0o444)
    return {"vault": str(destination)}
