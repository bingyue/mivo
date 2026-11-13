import hmac
import json
import platform
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from starlette.concurrency import run_in_threadpool
from pydantic import Field

from .backup import backup
from .embedding import CommercialEmbedding
from .ingestion import MAX_BYTES
from .jobs import Jobs
from .models import model_info
from .schemas import NoteInput, TranscriptInput, AnalysisInput, ConfirmInput, ASRInput, SearchInput, StrictModel
from .vault import Vault


class CloudInput(StrictModel):
    consent: bool = False


class HybridInput(SearchInput):
    consent: bool = False


class JobAction(StrictModel):
    action: str = Field(pattern="^(pause|resume)$")


def create_app(root: Path, token: str):
    if len(token) < 32:
        raise ValueError("TOKEN_TOO_SHORT")
    vault = Vault(root)
    jobs = Jobs(vault)

    @asynccontextmanager
    async def lifespan(app):
        jobs.start()
        yield
        jobs.close()

    app = FastAPI(title="Mivo Core", version="0.1.0", lifespan=lifespan,
                  docs_url=None, redoc_url=None, openapi_url=None)
    app.state.vault = vault

    @app.middleware("http")
    async def authenticate(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        origin = request.headers.get("origin")
        if host not in {"127.0.0.1", "localhost"}:
            return JSONResponse({"error": "INVALID_HOST"}, 403)
        if origin and urlparse(origin).netloc != request.headers.get("host"):
            return JSONResponse({"error": "CROSS_ORIGIN_FORBIDDEN"}, 403)
        bearer = request.headers.get("authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(bearer, token):
            return JSONResponse({"error": "UNAUTHORIZED"}, 401)
        return await call_next(request)

    @app.exception_handler(ValueError)
    async def invalid(request, error):
        return JSONResponse({"error": str(error)}, 409)

    @app.exception_handler(KeyError)
    async def missing(request, error):
        return JSONResponse({"error": str(error)}, 404)

    @app.exception_handler(PermissionError)
    async def forbidden(request, error):
        return JSONResponse({"error": str(error)}, 403)

    @app.get("/health")
    def health():
        return {"status": "ok", "version": "0.1.0", "vault": str(vault.root),
                "hardware": {"system": platform.system(), "machine": platform.machine(),
                             "cpu": platform.processor(), "free_disk": shutil.disk_usage(vault.root).free},
                "audio_decoder": "PyAV / FFmpeg libraries", "cloud_transcription": False,
                "default_asr_model": model_info(vault)["path"], "asr_download": model_info(vault),
                "embedding": {"configured": bool(CommercialEmbedding().endpoint and CommercialEmbedding().model),
                              "model": CommercialEmbedding().model}}

    @app.get("/sources")
    def sources():
        return vault.sources()

    @app.post("/sources/text")
    def text(body: NoteInput):
        return vault.import_text(body.title, body.text)

    @app.post("/sources/upload")
    async def upload(file: UploadFile = File(...)):
        name = Path(file.filename or "file").name
        with tempfile.TemporaryDirectory(dir=vault.path("tmp")) as scratch:
            target = Path(scratch) / ("upload" + Path(name).suffix.lower())
            size = 0
            with target.open("wb") as stream:
                while block := await file.read(1024 * 1024):
                    size += len(block)
                    if size > MAX_BYTES:
                        raise HTTPException(413, "FILE_TOO_LARGE")
                    stream.write(block)
            return await run_in_threadpool(vault.import_file, target, name)

    @app.get("/sources/{source_id}")
    def source(source_id: str):
        return vault.source(source_id)

    @app.get("/sources/{source_id}/original")
    def original(source_id: str):
        source = vault.source(source_id)
        return FileResponse(vault.path(source["original"]), filename=source["title"])

    @app.get("/sources/{source_id}/transcript")
    def transcript(source_id: str):
        return vault.transcript(source_id)

    @app.put("/sources/{source_id}/transcript")
    def edit_transcript(source_id: str, body: TranscriptInput):
        return vault.save_transcript(source_id, body.segments, body.expected_revision)

    @app.post("/sources/{source_id}/transcribe")
    def transcribe(source_id: str, body: ASRInput):
        return jobs.submit(source_id, body)

    @app.post("/sources/{source_id}/model")
    def install_model(source_id: str, body: ConfirmInput):
        return jobs.submit_model(source_id)

    @app.get("/jobs")
    def list_jobs():
        return vault.rows("SELECT * FROM jobs ORDER BY created_at DESC LIMIT 200")

    @app.post("/jobs/{job_id}")
    def change_job(job_id: str, body: JobAction):
        return jobs.change(job_id, body.action)

    @app.get("/analyses")
    def analyses(source_id: str | None = None):
        if source_id:
            rows = vault.rows("SELECT * FROM analyses WHERE source_id=? ORDER BY created_at DESC", (source_id,))
        else:
            rows = vault.rows("SELECT * FROM analyses ORDER BY created_at DESC LIMIT 100")
        return [dict(row, payload=json.loads(row["payload"])) for row in rows]

    @app.post("/analyses")
    def analysis(body: AnalysisInput):
        return vault.add_analysis(body)

    @app.post("/analyses/{analysis_id}/confirm")
    def confirm(analysis_id: str, body: ConfirmInput):
        return vault.confirm(analysis_id)

    @app.get("/memories")
    def memories():
        return vault.rows("SELECT id,title,source_id,created_at FROM memories ORDER BY created_at DESC LIMIT 500")

    @app.get("/memories/{memory_id}")
    def memory(memory_id: str):
        return vault.memory(memory_id)

    @app.post("/search")
    def search(body: SearchInput):
        return vault.search(**body.model_dump())

    @app.post("/search/hybrid")
    def hybrid(body: HybridInput):
        if any((body.source_id, body.since, body.until, body.entity)):
            raise ValueError("FILTERED_HYBRID_NOT_SUPPORTED: use local search")
        return CommercialEmbedding().search(vault, body.query, body.consent, body.limit)

    @app.post("/embeddings")
    def embeddings(body: CloudInput):
        return CommercialEmbedding().index(vault, body.consent)

    @app.post("/reindex")
    def reindex():
        return vault.reindex()

    @app.post("/exports")
    def export():
        return vault.export()

    @app.post("/backups")
    def make_backup():
        return backup(vault)

    @app.get("/artifacts/{kind}/{name}")
    def artifact(kind: str, name: str):
        if kind not in {"exports", "backups"} or Path(name).name != name:
            raise HTTPException(404)
        path = vault.path(f"{kind}/{name}")
        if not path.is_file():
            raise HTTPException(404)
        return FileResponse(path, filename=name)

    return app
