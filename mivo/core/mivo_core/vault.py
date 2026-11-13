import hashlib
import json
import os
import re
import shutil
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .database import Database
from .ingestion import AUDIO, VIDEO, TEXT, MAX_BYTES, extract
from .schemas import AnalysisInput, Segment


def now():
    return datetime.now(timezone.utc).isoformat()


def uid():
    return uuid.uuid4().hex


class Vault:
    def __init__(self, root: Path, readonly=False):
        self.root = root.expanduser().resolve()
        self.readonly = readonly
        self.lock = threading.RLock()
        if not readonly:
            self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
            for name in ("originals", "transcripts", "knowledge", "database", "exports", "backups", "config", "tmp"):
                target = self.root / name
                if target.is_symlink():
                    raise ValueError("VAULT_SYMLINK_FORBIDDEN")
                target.mkdir(exist_ok=True)
        self.db = Database(self.path("database/mivo.sqlite"), readonly)

    def path(self, relative: str):
        path = (self.root / relative).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("PATH_OUTSIDE_VAULT")
        return path

    def writable(self):
        if self.readonly:
            raise PermissionError("READ_ONLY_VAULT")

    def rows(self, sql, args=()):
        with self.db.connect() as db:
            return [dict(row) for row in db.execute(sql, args)]

    def audit(self, action, target):
        self.writable()
        with self.db.connect() as db:
            db.execute("INSERT INTO audit(action,target,created_at) VALUES(?,?,?)", (action, target, now()))

    def source(self, source_id):
        rows = self.rows("SELECT * FROM sources WHERE id=?", (source_id,))
        if not rows:
            raise KeyError("SOURCE_NOT_FOUND")
        return rows[0]

    def sources(self, limit=200):
        return self.rows("SELECT * FROM sources ORDER BY created_at DESC LIMIT ?", (min(500, limit),))

    def import_file(self, incoming: Path, title=None):
        self.writable()
        ext = incoming.suffix.lower()
        if ext not in AUDIO | VIDEO | TEXT:
            raise ValueError("UNSUPPORTED_FILE_TYPE")
        if not incoming.is_file() or incoming.stat().st_size > MAX_BYTES:
            raise ValueError("INVALID_FILE_SIZE")
        with incoming.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        with self.lock:
            existing = self.rows("SELECT * FROM sources WHERE sha256=?", (digest,))
            if existing:
                return dict(existing[0], duplicate=True)
            kind = "audio" if ext in AUDIO else "video" if ext in VIDEO else "text"
            text = extract(incoming) if kind == "text" else None
            if text is not None and (not text.strip() or len(text) > 2000000):
                raise ValueError("EMPTY_OR_OVERSIZED_TEXT: scanned PDFs need OCR before import")
            source_id = uid()
            original = f"originals/{digest}{ext}"
            destination = self.path(original)
            with incoming.open("rb") as src, destination.open("xb") as dest:
                shutil.copyfileobj(src, dest)
            destination.chmod(0o444)
            try:
                with self.db.connect() as db:
                    db.execute("INSERT INTO sources VALUES(?,?,?,?,?,?,?,0)", (
                        source_id, (title or incoming.name)[:240], kind, original, digest, now(),
                        "ready" if text else "imported",
                    ))
                if text:
                    self.save_transcript(source_id, [Segment(text=text[offset:offset + 8000])
                                                    for offset in range(0, len(text), 8000)], 0, "text-import")
            except BaseException:
                if not self.rows("SELECT id FROM sources WHERE id=?", (source_id,)):
                    destination.chmod(0o600)
                    destination.unlink()
                raise
            return dict(self.source(source_id), duplicate=False)

    def import_text(self, title, text):
        self.writable()
        temporary = self.path(f"tmp/{uid()}.txt")
        try:
            temporary.write_text(text, encoding="utf-8")
            return self.import_file(temporary, title)
        finally:
            temporary.unlink(missing_ok=True)

    def transcript(self, source_id, revision=None):
        source = self.source(source_id)
        rows = self.rows("SELECT * FROM transcripts WHERE source_id=? AND revision=?", (
            source_id, revision or source["transcript_revision"],
        ))
        if not rows:
            raise KeyError("TRANSCRIPT_NOT_FOUND")
        return dict(rows[0], segments=json.loads(rows[0]["segments"]))

    def save_transcript(self, source_id, segments, expected_revision, engine="human"):
        self.writable()
        segments = [Segment.model_validate(s) for s in segments]
        if not segments or any(s.end < s.start for s in segments):
            raise ValueError("INVALID_SEGMENTS")
        text = "\n".join(s.text for s in segments)
        if not text.strip() or len(text) > 2000000:
            raise ValueError("INVALID_TRANSCRIPT_TEXT")
        revision = expected_revision + 1
        with self.lock, self.db.connect() as db:
            source = db.execute("SELECT * FROM sources WHERE id=?", (source_id,)).fetchone()
            if not source:
                raise KeyError("SOURCE_NOT_FOUND")
            if source["transcript_revision"] != expected_revision:
                raise ValueError("TRANSCRIPT_REVISION_CONFLICT")
            db.execute("INSERT INTO transcripts VALUES(?,?,?,?,?,?)", (
                source_id, revision, json.dumps([s.model_dump() for s in segments], ensure_ascii=False),
                text, engine, now(),
            ))
            db.execute("UPDATE sources SET transcript_revision=?,status='ready' WHERE id=?", (revision, source_id))
            self.write_markdown(f"transcripts/{source_id}-v{revision}.md", f"# {source['title']}\n\n" +
                                "\n\n".join(f"[{s.start:.2f}–{s.end:.2f}] {s.speaker or ''}\n{s.text}" for s in segments))
        return self.transcript(source_id)

    def write_markdown(self, name, content):
        target = self.path(name)
        temporary = target.with_suffix(f".{uid()}.tmp")
        temporary.write_text(content, encoding="utf-8")
        os.replace(temporary, target)

    def add_analysis(self, analysis: AnalysisInput):
        self.writable()
        transcript = self.transcript(analysis.source_id, analysis.transcript_revision)
        if any(i < 0 or i >= len(transcript["segments"]) for i in analysis.evidence):
            raise ValueError("INVALID_EVIDENCE_SEGMENT")
        if any(len(value) > 2000 for field in (analysis.people, analysis.projects, analysis.topics,
                   analysis.viewpoints, analysis.decisions, analysis.tasks) for value in field):
            raise ValueError("ANALYSIS_FIELD_TOO_LONG")
        analysis_id = uid()
        with self.db.connect() as db:
            db.execute("INSERT INTO analyses VALUES(?,?,?,?,0)", (
                analysis_id, analysis.source_id, analysis.model_dump_json(), now(),
            ))
        return self.analysis(analysis_id)

    def analysis(self, analysis_id):
        rows = self.rows("SELECT * FROM analyses WHERE id=?", (analysis_id,))
        if not rows:
            raise KeyError("ANALYSIS_NOT_FOUND")
        return dict(rows[0], payload=json.loads(rows[0]["payload"]))

    def confirm(self, analysis_id):
        self.writable()
        with self.lock:
            existing = self.rows("SELECT * FROM memories WHERE analysis_id=?", (analysis_id,))
            if existing:
                return existing[0]
            analysis = self.analysis(analysis_id)
            data = AnalysisInput.model_validate(analysis["payload"])
            source = self.source(data.source_id)
            if source["transcript_revision"] != data.transcript_revision:
                raise ValueError("STALE_ANALYSIS: transcript changed; regenerate before confirmation")
            transcript = self.transcript(data.source_id, data.transcript_revision)
            memory_id = uid()
            md = f"# {source['title']}\n\n{data.summary}\n\n"
            for label, values in [("人物", data.people), ("项目", data.projects), ("主题", data.topics),
                                  ("观点", data.viewpoints), ("决策", data.decisions), ("待办", data.tasks)]:
                md += f"## {label}\n\n" + "\n".join(f"- {v}" for v in values) + "\n\n"
            md += f"来源: mivo://source/{data.source_id}\n\n原件: ../{source['original']}\n\n"
            md += f"模型: {data.model} / Prompt: {data.prompt_version} / 逐字稿版本: {data.transcript_revision}\n"
            evidence = [transcript["segments"][i] for i in data.evidence]
            md += "\n## 来源片段\n\n" + "\n\n".join(f"[{s['start']}–{s['end']}] {s['text']}" for s in evidence)
            relative = f"knowledge/{memory_id}.md"
            with self.db.connect() as db:
                db.execute("INSERT INTO memories VALUES(?,?,?,?,?,?,?)", (
                    memory_id, analysis_id, data.source_id, source["title"], md, now(), data.model_dump_json(),
                ))
                db.execute("UPDATE analyses SET confirmed=1 WHERE id=?", (analysis_id,))
                self._index_memory(db, memory_id, data.source_id, md, evidence)
                self.write_markdown(relative, md)
                db.execute("INSERT INTO audit(action,target,created_at) VALUES('confirm',?,?)", (analysis_id, now()))
            return self.memory(memory_id)

    def _index_memory(self, db, memory_id, source_id, md, evidence):
        for offset in range(0, len(md), 1200):
            chunk_id = f"{memory_id}-{offset}"
            text = md[offset:offset + 1400]
            db.execute("INSERT INTO chunks VALUES(?,?,?,?,?,?)", (
                chunk_id, memory_id, source_id, text,
                min(s["start"] for s in evidence), max(s["end"] for s in evidence),
            ))
            db.execute("INSERT INTO chunks_fts VALUES(?,?)", (chunk_id, text))

    def memory(self, memory_id):
        rows = self.rows("SELECT * FROM memories WHERE id=?", (memory_id,))
        if not rows:
            raise KeyError("MEMORY_NOT_FOUND")
        return dict(rows[0], payload=json.loads(rows[0]["payload"]))

    def search(self, query, limit=10, source_id=None, since=None, until=None, entity=None):
        if not query.strip() or len(query) > 500 or not 1 <= limit <= 30:
            raise ValueError("INVALID_SEARCH")
        params = []
        conditions = []
        if len(query.strip()) >= 3:
            join = "JOIN chunks_fts f ON f.id=c.id"
            conditions.append("chunks_fts MATCH ?")
            params.append('"' + query.replace('"', '""') + '"')
            order = "bm25(chunks_fts)"
        else:
            join = ""
            conditions.append("instr(lower(c.text),lower(?))>0")
            params.append(query)
            order = "m.created_at DESC"
        for expression, value in [("c.source_id=?", source_id), ("s.created_at>=?", since),
                                   ("s.created_at<=?", until), ("instr(m.payload,?)>0", entity)]:
            if value:
                conditions.append(expression)
                params.append(value)
        params.append(limit)
        sql = f"""SELECT c.*, s.title,s.original,s.created_at,
            'mivo://source/' || s.id AS reference FROM chunks c
            JOIN sources s ON s.id=c.source_id JOIN memories m ON m.id=c.memory_id {join}
            WHERE {' AND '.join(conditions)} ORDER BY {order} LIMIT ?"""
        exact = self.rows(sql, params)
        if exact:
            return exact
        words = re.findall(r"[a-zA-Z0-9]{2,}|[\u4e00-\u9fff]+", query.lower())
        terms = []
        for word in words:
            terms.extend([word[i:i + 2] for i in range(len(word) - 1)] if re.fullmatch(r"[\u4e00-\u9fff]+", word) else [word])
        terms = list(dict.fromkeys(term for term in terms if term not in {'什么', '哪些', '如何', '可以', '我们', 'the', 'what', 'with', 'from', 'or', 'and', 'not'}))[:30]
        if not terms:
            return []
        score = ' + '.join('CASE WHEN instr(lower(c.text),?)>0 THEN 1 ELSE 0 END' for _ in terms)
        filters, values = [], []
        for expression, value in [("c.source_id=?", source_id), ("s.created_at>=?", since),
                                   ("s.created_at<=?", until), ("instr(m.payload,?)>0", entity)]:
            if value:
                filters.append(expression)
                values.append(value)
        return self.rows(f"""SELECT c.*,s.title,s.original,s.created_at,
            'mivo://source/' || s.id AS reference, ({score}) AS keyword_score FROM chunks c
            JOIN sources s ON s.id=c.source_id JOIN memories m ON m.id=c.memory_id
            WHERE keyword_score>0 {'AND ' + ' AND '.join(filters) if filters else ''}
            ORDER BY keyword_score DESC,m.created_at DESC LIMIT ?""", [*terms, *values, limit])

    def reindex(self):
        self.writable()
        with self.lock, self.db.connect() as db:
            db.execute("DELETE FROM chunks_fts")
            db.execute("INSERT INTO chunks_fts SELECT id,text FROM chunks")
        return {"chunks": self.rows("SELECT count(*) AS n FROM chunks")[0]["n"]}

    def export(self):
        self.writable()
        name = f"exports/mivo-{uid()}.json"
        data = {"schema": 1, "exported_at": now(), "sources": self.rows("SELECT * FROM sources ORDER BY created_at"),
                "transcripts": self.rows("SELECT * FROM transcripts"),
                "analyses": self.rows("SELECT * FROM analyses"), "memories": self.rows("SELECT * FROM memories")}
        self.write_markdown(name, json.dumps(data, ensure_ascii=False, indent=2))
        return {"path": name}
