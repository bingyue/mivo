import hashlib

import httpx

REPOSITORY = "Systran/faster-whisper-tiny"
REVISION = "d90ca5fe260221311c53c58e660288d3deb8d356"
FILES = {
    "README.md": (1991, "29fb8444a02c1f133ab7e538525aa478ff68845964f21cf42500842b0e4a7b20"),
    "config.json": (2249, "a73a28cdfe1c43ccc7202fa333d1f89c202477271407ae9a7f19afa52039cac8"),
    "model.bin": (75538270, "dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1"),
    "tokenizer.json": (2203239, "fb7b63191e9bb045082c79fd742a3106a12c99513ab30df4a0d47fa6cb6fd0ab"),
    "vocabulary.txt": (459861, "34ce3fe1c5041027b3f8d42912270993f986dbc4bb34cf27f951e34a1e453913"),
}


def model_info(vault):
    path = vault.path("models/whisper-tiny")
    return {"id": "whisper-tiny", "name": "Whisper tiny (multilingual)", "license": "MIT",
            "repository": REPOSITORY, "revision": REVISION, "bytes": sum(size for size, _ in FILES.values()),
            "path": str(path) if (path / ".ready").is_file() else ""}


def verified(path, size, digest):
    if not path.is_file() or path.stat().st_size != size:
        return False
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest() == digest


def download_model(vault, cancelled, progress):
    directory = vault.path("models/whisper-tiny")
    directory.mkdir(parents=True, exist_ok=True)
    total = sum(size for size, _ in FILES.values())
    completed = 0
    for name, (size, digest) in FILES.items():
        if cancelled():
            return False
        target = vault.path(f"models/whisper-tiny/{name}")
        if not verified(target, size, digest):
            stage = vault.path(f"models/whisper-tiny/{name}.part")
            offset = stage.stat().st_size if stage.exists() else 0
            if offset >= size:
                stage.unlink()
                offset = 0
            url = f"https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{name}?download=true"
            with httpx.stream("GET", url, headers={"Range": f"bytes={offset}-"} if offset else {},
                              follow_redirects=True, timeout=httpx.Timeout(30, read=30)) as response:
                response.raise_for_status()
                append = response.status_code == 206 and response.headers.get("content-range", "").startswith(f"bytes {offset}-")
                received = offset if append else 0
                with stage.open("ab" if append else "wb") as output:
                    for block in response.iter_bytes(256 * 1024):
                        if cancelled():
                            return False
                        received += len(block)
                        if received > size:
                            raise ValueError("MODEL_SIZE_MISMATCH")
                        output.write(block)
                        progress(min(.99, (completed + received) / total))
            if not verified(stage, size, digest):
                stage.unlink(missing_ok=True)
                raise ValueError("MODEL_CHECKSUM_MISMATCH")
            stage.replace(target)
        completed += size
        progress(min(.99, completed / total))
    vault.path("models/whisper-tiny/.ready").write_text(REVISION)
    return True
