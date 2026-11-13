import hashlib
import time
import wave

import pytest

from mivo_core.jobs import Jobs
from mivo_core.schemas import ASRInput
from mivo_core.vault import Vault


def wait_for(jobs, job_id, status):
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        job = jobs.get(job_id)
        if job["status"] == status:
            return job
        time.sleep(.05)
    raise AssertionError(f"Expected {status}, got {jobs.get(job_id)}")


def test_persistent_queue_pause_failure_and_restart(tmp_path):
    audio = tmp_path / "silence.wav"
    with wave.open(str(audio), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(16000)
        stream.writeframes(b"\x00\x00" * 16000)
    vault = Vault(tmp_path / "vault")
    source = vault.import_file(audio)
    original = vault.path(source["original"])
    digest = hashlib.sha256(original.read_bytes()).hexdigest()
    jobs = Jobs(vault)
    options = ASRInput(model_path=str(tmp_path / "missing-model"))
    job = jobs.submit(source["id"], options)
    with pytest.raises(ValueError, match="ALREADY_ACTIVE"):
        jobs.submit(source["id"], options)
    assert jobs.change(job["id"], "pause")["status"] == "paused"
    jobs.start()
    try:
        time.sleep(.4)
        assert jobs.get(job["id"])["status"] == "paused"
        jobs.change(job["id"], "resume")
        failed = wait_for(jobs, job["id"], "failed")
        assert "LOCAL_MODEL_NOT_FOUND" in failed["error"]
        assert vault.source(source["id"])["transcript_revision"] == 0
    finally:
        jobs.close()
    with vault.db.connect() as db:
        db.execute("UPDATE jobs SET status='running' WHERE id=?", (job["id"],))
    restarted = Jobs(Vault(vault.root))
    restarted.start()
    try:
        failed = wait_for(restarted, job["id"], "failed")
        assert "LOCAL_MODEL_NOT_FOUND" in failed["error"]
        assert hashlib.sha256(original.read_bytes()).hexdigest() == digest
    finally:
        restarted.close()
