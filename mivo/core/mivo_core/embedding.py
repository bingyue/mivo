import json
import math
import os
from urllib.parse import urlparse

import httpx


class CommercialEmbedding:
    def __init__(self):
        self.endpoint = os.environ.get("MIVO_EMBEDDING_URL", "")
        self.model = os.environ.get("MIVO_EMBEDDING_MODEL", "")
        self.key = os.environ.get("MIVO_EMBEDDING_API_KEY", "")

    def vectors(self, texts, consent):
        if consent is not True:
            raise PermissionError("CLOUD_CONSENT_REQUIRED")
        url = urlparse(self.endpoint)
        if url.scheme != "https" or not url.hostname or url.username or url.password:
            raise ValueError("CONFIGURE_HTTPS_COMMERCIAL_EMBEDDING_ENDPOINT")
        if not self.key or not self.model:
            raise ValueError("EMBEDDING_NOT_CONFIGURED")
        response = httpx.post(self.endpoint, headers={"Authorization": f"Bearer {self.key}"},
                              json={"model": self.model, "input": texts}, timeout=90, follow_redirects=False)
        if response.status_code != 200:
            raise ValueError(f"EMBEDDING_HTTP_{response.status_code}")
        rows = sorted(response.json()["data"], key=lambda item: item["index"])
        if [r["index"] for r in rows] != list(range(len(texts))):
            raise ValueError("EMBEDDING_RESPONSE_COUNT_MISMATCH")
        vectors = [row["embedding"] for row in rows]
        dimensions = len(vectors[0]) if vectors else 0
        if not dimensions or dimensions > 16384 or any(
                len(v) != dimensions or not all(type(x) in (float, int) and math.isfinite(x) for x in v)
                or not any(v) for v in vectors):
            raise ValueError("INVALID_EMBEDDING_VECTOR")
        return vectors

    def index(self, vault, consent):
        if consent is not True:
            raise PermissionError("CLOUD_CONSENT_REQUIRED")
        rows = vault.rows("SELECT id,text FROM chunks")
        count = 0
        for offset in range(0, len(rows), 32):
            batch = rows[offset:offset + 32]
            vectors = self.vectors([r["text"] for r in batch], consent)
            with vault.db.connect() as db:
                for row, vector in zip(batch, vectors):
                    db.execute("INSERT OR REPLACE INTO embeddings VALUES(?,?,?,?,?)", (
                        row["id"], self.endpoint, self.model, len(vector), json.dumps(vector),
                    ))
                    count += 1
        return {"indexed": count, "model": self.model}

    def search(self, vault, query, consent, limit=10):
        vector = self.vectors([query], consent)[0]
        rows = vault.rows("""SELECT c.*,s.title,s.original,s.created_at,e.vector FROM embeddings e
            JOIN chunks c ON e.chunk_id=c.id JOIN sources s ON s.id=c.source_id
            WHERE e.provider=? AND e.model=? AND e.dimensions=?""", (self.endpoint, self.model, len(vector)))
        def similarity(row):
            other = json.loads(row["vector"])
            return sum(a*b for a,b in zip(vector,other)) / (math.sqrt(sum(a*a for a in vector)) *
                                                           math.sqrt(sum(b*b for b in other)))
        semantic = sorted(rows, key=similarity, reverse=True)[:limit]
        lexical = vault.search(query, limit)
        scores, merged = {}, {}
        for results in (lexical, semantic):
            for rank, row in enumerate(results):
                row.pop("vector", None)
                row["reference"] = f"mivo://source/{row['source_id']}"
                merged[row["id"]] = row
                scores[row["id"]] = scores.get(row["id"], 0) + 1/(60+rank)
        return [merged[key] for key in sorted(scores, key=scores.get, reverse=True)[:limit]]
