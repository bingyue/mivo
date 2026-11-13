import sqlite3
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, original TEXT NOT NULL UNIQUE,
 sha256 TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, status TEXT NOT NULL,
 transcript_revision INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS transcripts (
 source_id TEXT NOT NULL REFERENCES sources(id), revision INTEGER NOT NULL,
 segments TEXT NOT NULL, text TEXT NOT NULL, engine TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(source_id,revision)
);
CREATE TABLE IF NOT EXISTS analyses (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id),
 payload TEXT NOT NULL, created_at TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memories (
 id TEXT PRIMARY KEY, analysis_id TEXT UNIQUE REFERENCES analyses(id),
 source_id TEXT NOT NULL REFERENCES sources(id), title TEXT NOT NULL, markdown TEXT NOT NULL,
 created_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chunks (
 id TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memories(id),
 source_id TEXT NOT NULL REFERENCES sources(id), text TEXT NOT NULL, start REAL, end REAL
);
CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(id UNINDEXED, text, tokenize='trigram');
CREATE TABLE IF NOT EXISTS embeddings (
 chunk_id TEXT NOT NULL REFERENCES chunks(id), provider TEXT NOT NULL, model TEXT NOT NULL,
 dimensions INTEGER NOT NULL, vector TEXT NOT NULL, PRIMARY KEY(chunk_id,provider,model)
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES sources(id), kind TEXT NOT NULL,
 options TEXT NOT NULL, status TEXT NOT NULL, progress REAL NOT NULL DEFAULT 0,
 error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
 id INTEGER PRIMARY KEY, action TEXT NOT NULL, target TEXT, created_at TEXT NOT NULL
);
PRAGMA user_version=1;
"""


class Database:
    def __init__(self, path: Path, readonly: bool = False):
        self.path, self.readonly = path, readonly
        if readonly:
            if not path.is_file():
                raise ValueError("VAULT_NOT_FOUND")
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with self.connect() as db:
                version = db.execute("PRAGMA user_version").fetchone()[0]
                if version > 1:
                    raise ValueError("VAULT_VERSION_NEWER_THAN_APP")
                db.execute("PRAGMA journal_mode=WAL")
                db.executescript(SCHEMA)

    @contextmanager
    def connect(self):
        uri = self.path.resolve().as_uri() + ("?mode=ro" if self.readonly else "?mode=rwc")
        db = sqlite3.connect(uri, uri=True, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            yield db
            if not self.readonly:
                db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()
