import json
import subprocess
import sys
import threading

from .schemas import ASRInput
from .models import download_model
from .vault import now, uid


class Jobs:
    def __init__(self, vault):
        self.vault = vault
        self.stop = threading.Event()
        self.current = None
        self.thread = None

    def start(self):
        with self.vault.db.connect() as db:
            db.execute("UPDATE jobs SET status='queued',progress=0 WHERE status='running'")
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.current and self.current.poll() is None:
            self.current.terminate()
        if self.thread:
            self.thread.join(timeout=15)

    def submit(self, source_id, options: ASRInput):
        source = self.vault.source(source_id)
        if source["kind"] not in {"audio", "video"}:
            raise ValueError("ASR_REQUIRES_AUDIO_OR_VIDEO")
        with self.vault.lock, self.vault.db.connect() as db:
            existing = db.execute("SELECT * FROM jobs WHERE source_id=? AND status IN ('queued','running','paused')",
                                  (source_id,)).fetchone()
            if existing:
                raise ValueError("ASR_JOB_ALREADY_ACTIVE")
            job_id = uid()
            data = dict(options.model_dump(), expected_revision=source["transcript_revision"])
            db.execute("INSERT INTO jobs VALUES(?,?, 'asr',?,'queued',0,NULL,?,?)",
                       (job_id, source_id, json.dumps(data), now(), now()))
        return self.get(job_id)

    def get(self, job_id):
        rows = self.vault.rows("SELECT * FROM jobs WHERE id=?", (job_id,))
        if not rows:
            raise KeyError("JOB_NOT_FOUND")
        return rows[0]

    def submit_model(self, source_id):
        self.vault.source(source_id)
        with self.vault.lock, self.vault.db.connect() as db:
            existing = db.execute("SELECT * FROM jobs WHERE kind='model-download' AND status IN ('queued','running','paused')").fetchone()
            if existing:
                return dict(existing)
            job_id = uid()
            db.execute("INSERT INTO jobs VALUES(?,?,'model-download','{}','queued',0,NULL,?,?)",
                       (job_id, source_id, now(), now()))
        return self.get(job_id)

    def change(self, job_id, action):
        with self.vault.lock, self.vault.db.connect() as db:
            job = self.get(job_id)
            if action == "pause" and job["status"] in {"queued", "running"}:
                status = "paused"
            elif action == "resume" and job["status"] in {"paused", "failed"}:
                status = "queued"
            else:
                raise ValueError("INVALID_JOB_TRANSITION")
            db.execute("UPDATE jobs SET status=?,error=NULL,updated_at=? WHERE id=?", (status, now(), job_id))
        return self.get(job_id)

    def run(self):
        while not self.stop.wait(.25):
            with self.vault.lock, self.vault.db.connect() as db:
                row = db.execute("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1").fetchone()
                if not row:
                    continue
                job = dict(row)
                db.execute("UPDATE jobs SET status='running',progress=0,error=NULL WHERE id=?", (job["id"],))
            try:
                self.execute(job)
            except Exception as error:
                with self.vault.db.connect() as db:
                    db.execute("UPDATE jobs SET status='failed',error=?,updated_at=? WHERE id=? AND status='running'",
                               (str(error)[-2000:], now(), job["id"]))
            finally:
                self.current = None

    def execute(self, job):
        if job["kind"] == "model-download":
            def progress(value):
                with self.vault.db.connect() as db:
                    db.execute("UPDATE jobs SET progress=?,updated_at=? WHERE id=?", (value, now(), job["id"]))
            complete = download_model(self.vault,
                lambda: self.stop.is_set() or self.get(job["id"])["status"] == "paused", progress)
            if complete:
                with self.vault.db.connect() as db:
                    db.execute("UPDATE jobs SET status='completed',progress=1,updated_at=? WHERE id=?", (now(), job["id"]))
            return
        source = self.vault.source(job["source_id"])
        options = json.loads(job["options"])
        error_path = self.vault.path(f"tmp/{job['id']}.log")
        segments = []
        with error_path.open("w+") as errors:
            process = subprocess.Popen([sys.executable, *(["--asr-worker"] if getattr(sys, "frozen", False) else ["-m", "mivo_core.asr"]),
                                        str(self.vault.path(source["original"])), job["options"]],
                                       stdout=subprocess.PIPE, stderr=errors, text=True,
                                       creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            self.current = process
            def monitor():
                while process.poll() is None:
                    if self.stop.wait(.2) or self.get(job["id"])["status"] == "paused":
                        process.terminate()
                        return
            watcher = threading.Thread(target=monitor, daemon=True)
            watcher.start()
            try:
                for line in process.stdout:
                    if not line.startswith('{"segment"'):
                        continue
                    event = json.loads(line)
                    segments.append(event["segment"])
                    with self.vault.db.connect() as db:
                        db.execute("UPDATE jobs SET progress=?,updated_at=? WHERE id=?",
                                   (event["progress"], now(), job["id"]))
                code = process.wait(timeout=10)
                watcher.join(timeout=2)
                if self.stop.is_set() or self.get(job["id"])["status"] == "paused":
                    return
                if code:
                    errors.seek(0)
                    raise ValueError("LOCAL_ASR_FAILED: " + errors.read()[-1500:])
                self.vault.save_transcript(source["id"], segments, options["expected_revision"], options["provider"])
                with self.vault.db.connect() as db:
                    db.execute("UPDATE jobs SET status='completed',progress=1,updated_at=? WHERE id=?",
                               (now(), job["id"]))
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait(timeout=10)
                process.stdout.close()
        error_path.unlink(missing_ok=True)
