import csv
import io
import json
from html.parser import HTMLParser
from pathlib import Path

AUDIO = {".mp3", ".m4a", ".wav", ".flac", ".aac", ".ogg"}
VIDEO = {".mp4", ".mov", ".mkv", ".webm"}
TEXT = {".txt", ".md", ".markdown", ".json", ".csv", ".html", ".pdf", ".docx"}
MAX_BYTES = 1024 * 1024 * 1024


class PlainHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def extract(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        from pypdf import PdfReader
        return "\n\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    if ext == ".docx":
        from docx import Document
        doc = Document(path)
        return "\n".join([p.text for p in doc.paragraphs] + [
            " | ".join(cell.text for cell in row.cells) for table in doc.tables for row in table.rows
        ])
    raw = path.read_text(encoding="utf-8-sig")
    if ext == ".html":
        parser = PlainHTML()
        parser.feed(raw)
        return "\n".join(parser.parts)
    if ext == ".json":
        return json.dumps(json.loads(raw), ensure_ascii=False, indent=2)
    if ext == ".csv":
        return "\n".join(" | ".join(row) for row in csv.reader(io.StringIO(raw)))
    return raw
