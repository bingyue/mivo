import hashlib
import json
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from mivo_core.api import create_app
from mivo_core.backup import backup, restore
from mivo_core.schemas import AnalysisInput, Segment
from mivo_core.vault import Vault


@pytest.fixture
def vault(tmp_path):
    return Vault(tmp_path / "vault")


def draft(vault, text="讨论 Mivo 个人记忆系统，决定先保护本地原始录音。"):
    source = vault.import_text("研发会议", text)
    analysis = vault.add_analysis(AnalysisInput(source_id=source["id"], transcript_revision=1,
        model="test-fixture:human-authored", summary=text, people=["小王"], projects=["Mivo"],
        topics=["记忆系统"], decisions=["原件只读"], tasks=["小王补充来源追溯"], evidence=[0]))
    return source, analysis


def test_import_deduplicates_and_restart_preserves_original(vault):
    source = vault.import_text("原始资料", "不可覆盖的录音文字")
    duplicate = vault.import_text("第二份", "不可覆盖的录音文字")
    assert duplicate["id"] == source["id"]
    assert duplicate["duplicate"] is True
    restarted = Vault(vault.root)
    assert restarted.transcript(source["id"])["text"] == "不可覆盖的录音文字"
    assert restarted.path(source["original"]).read_text() == "不可覆盖的录音文字"
    assert restarted.path(source["original"]).stat().st_mode & 0o222 == 0


def test_analysis_draft_is_not_searchable_until_human_confirmation(vault):
    source, analysis = draft(vault)
    assert vault.search("记忆系统") == []
    memory = vault.confirm(analysis["id"])
    hits = vault.search("记忆系统")
    assert len(hits) == 1
    assert hits[0]["source_id"] == source["id"]
    assert hits[0]["reference"] == f"mivo://source/{source['id']}"
    assert vault.confirm(analysis["id"])["id"] == memory["id"]
    assert vault.path(f"knowledge/{memory['id']}.md").is_file()


def test_short_chinese_query_uses_literal_search(vault):
    _, analysis = draft(vault)
    vault.confirm(analysis["id"])
    assert len(vault.search("记忆")) == 1
    assert vault.search('" OR 1=1 --') == []


def test_corrected_transcript_preserves_history_and_rejects_stale_draft(vault):
    source, analysis = draft(vault)
    vault.save_transcript(source["id"], [Segment(text="校正后的文字")], 1)
    assert "记忆系统" in vault.transcript(source["id"], 1)["text"]
    assert vault.transcript(source["id"])["text"] == "校正后的文字"
    with pytest.raises(ValueError, match="STALE_ANALYSIS"):
        vault.confirm(analysis["id"])
    with pytest.raises(ValueError, match="REVISION_CONFLICT"):
        vault.save_transcript(source["id"], [Segment(text="并发编辑")], 1)


def test_evidence_must_point_to_real_segment(vault):
    source, _ = draft(vault)
    with pytest.raises(ValueError, match="INVALID_EVIDENCE"):
        vault.add_analysis(AnalysisInput(source_id=source["id"], transcript_revision=1,
                                         summary="无效证据", model="fixture", evidence=[100]))


def test_backup_restore_checks_integrity_and_retains_search(vault, tmp_path):
    source, analysis = draft(vault)
    vault.confirm(analysis["id"])
    archive = backup(vault)
    target = tmp_path / "restored"
    restore(vault.path(archive["path"]), target)
    restored = Vault(target)
    assert restored.search("记忆系统")[0]["source_id"] == source["id"]
    assert restored.transcript(source["id"])["revision"] == 1
    assert restored.path(source["original"]).read_bytes() == vault.path(source["original"]).read_bytes()
    with pytest.raises(ValueError, match="EMPTY_DESTINATION"):
        restore(vault.path(archive["path"]), target)


def test_restore_rejects_zip_traversal(tmp_path):
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("../outside.txt", "attack")
    with pytest.raises(ValueError, match="UNSAFE_BACKUP"):
        restore(archive, tmp_path / "restore")
    assert not (tmp_path / "outside.txt").exists()


def test_restore_rejects_tampered_content(vault, tmp_path):
    draft(vault)
    original = vault.path(backup(vault)["path"])
    bad = tmp_path / "tampered.zip"
    with zipfile.ZipFile(original) as src, zipfile.ZipFile(bad, "w") as dest:
        for name in src.namelist():
            dest.writestr(name, b"tampered" if name.startswith("originals/") else src.read(name))
    with pytest.raises(ValueError, match="CHECKSUM_MISMATCH"):
        restore(bad, tmp_path / "restored")


def test_vault_rejects_symlink_escape(vault, tmp_path):
    (vault.root / "escape").symlink_to(tmp_path)
    with pytest.raises(ValueError, match="PATH_OUTSIDE"):
        vault.path("escape/private.txt")
    with pytest.raises(ValueError, match="PATH_OUTSIDE"):
        vault.path("../private.txt")


def test_readonly_vault_refuses_mutations(vault):
    source, _ = draft(vault)
    reader = Vault(vault.root, readonly=True)
    assert reader.source(source["id"])["title"] == "研发会议"
    with pytest.raises(PermissionError, match="READ_ONLY"):
        reader.import_text("bad", "bad")
    with reader.db.connect() as db:
        with pytest.raises(Exception, match="readonly"):
            db.execute("DELETE FROM sources")


def test_http_auth_origin_and_confirmation_gate(tmp_path):
    app = create_app(tmp_path / "vault", "x" * 32)
    with TestClient(app, base_url="http://127.0.0.1") as client:
        assert client.get("/health").status_code == 401
        headers = {"Authorization": "Bearer " + "x" * 32}
        assert client.get("/health", headers=headers).status_code == 200
        assert client.post("/sources/text", headers=dict(headers, Origin="https://evil.example"),
                           json={"title": "x", "text": "private"}).status_code == 403
        assert client.get("/health", headers=dict(headers, Host="evil.example")).status_code == 403
        source = client.post("/sources/text", headers=headers, json={"title": "真实导入", "text": "来自文件"}).json()
        response = client.post("/analyses", headers=headers, json={"source_id": source["id"],
            "transcript_revision": 1, "model": "fixture", "summary": "测试来源", "evidence": [0]})
        assert response.status_code == 200
        assert client.post(f"/analyses/{response.json()['id']}/confirm", headers=headers,
                           json={"confirmed": False}).status_code == 422
        assert client.get("/memories", headers=headers).json() == []
        assert client.post(f"/analyses/{response.json()['id']}/confirm", headers=headers,
                           json={"confirmed": True}).status_code == 200
        assert len(client.get("/memories", headers=headers).json()) == 1


def test_document_import_docx_pdf_and_html(vault, tmp_path):
    from docx import Document
    from pypdf import PdfWriter
    doc = Document()
    doc.add_paragraph("DOCX 真实提取文本")
    word = tmp_path / "meeting.docx"
    doc.save(word)
    source = vault.import_file(word)
    assert vault.transcript(source["id"])["text"] == "DOCX 真实提取文本"
    html = tmp_path / "note.html"
    html.write_text("<h1>页面内容</h1><script>secret()</script>")
    source = vault.import_file(html)
    assert vault.transcript(source["id"])["text"] == "页面内容"
    pdf = tmp_path / "empty.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.write(pdf)
    with pytest.raises(ValueError, match="EMPTY_OR_OVERSIZED"):
        vault.import_file(pdf)


def test_real_pdf_text_extraction_and_multisource_retrieval(vault, tmp_path):
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    writer = PdfWriter()
    page = writer.add_blank_page(width=300, height=300)
    font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                             NameObject("/Subtype"): NameObject("/Type1"),
                             NameObject("/BaseFont"): NameObject("/Helvetica")})
    page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
    stream = DecodedStreamObject()
    stream.set_data(b"BT /F1 12 Tf 20 50 Td (Mivo preserves original sources.) Tj ET")
    page[NameObject("/Contents")] = writer._add_object(stream)
    pdf = tmp_path / "source.pdf"
    writer.write(pdf)
    source = vault.import_file(pdf)
    assert "Mivo preserves original sources." in vault.transcript(source["id"])["text"]
    other = vault.import_text("第二次讨论", "Mivo decisions must include evidence.")
    for item in (source, other):
        analysis = vault.add_analysis(AnalysisInput(source_id=item["id"], transcript_revision=1,
            model="human-authored-test-fixture", summary=vault.transcript(item["id"])["text"], evidence=[0]))
        vault.confirm(analysis["id"])
    results = vault.search("Mivo")
    assert {row["source_id"] for row in results} == {source["id"], other["id"]}
    assert all(row["reference"].startswith("mivo://source/") for row in results)


def test_model_download_requires_explicit_confirmation(tmp_path):
    app = create_app(tmp_path / "vault", "x" * 32)
    with TestClient(app, base_url="http://127.0.0.1", headers={"Authorization": "Bearer " + "x" * 32}) as client:
        source = client.post("/sources/text", json={"title": "来源", "text": "test source"}).json()
        assert client.post(f"/sources/{source['id']}/model", json={"confirmed": False}).status_code == 422
        assert client.get("/jobs").json() == []
        assert client.get("/health").json()["default_asr_model"] == ""


def test_export_and_reindex_preserve_provenance(vault):
    source, analysis = draft(vault)
    vault.confirm(analysis["id"])
    with vault.db.connect() as db:
        db.execute("DELETE FROM chunks_fts")
    assert vault.rows("SELECT count(*) AS n FROM chunks_fts")[0]["n"] == 0
    assert vault.reindex()["chunks"] == 1
    assert vault.search("记忆系统")[0]["source_id"] == source["id"]
    data = json.loads(vault.path(vault.export()["path"]).read_text())
    assert data["memories"][0]["source_id"] == source["id"]


def test_natural_language_search_preserves_source_filter(vault):
    source, analysis = draft(vault)
    vault.confirm(analysis["id"])
    assert vault.search("小王要做哪些待办？")[0]["source_id"] == source["id"]
    assert vault.search("小王要做哪些待办？", source_id="not-authorized") == []


def test_long_text_import_keeps_all_content_and_original(vault):
    text = "中文长资料 abcde。" * 11000
    source = vault.import_text("超过单片段的文本", text)
    transcript = vault.transcript(source["id"])
    assert len(transcript["segments"]) > 1
    assert "".join(item["text"] for item in transcript["segments"]) == text
    assert vault.path(source["original"]).read_text() == text


def test_embedding_rejects_without_explicit_cloud_consent(vault):
    from mivo_core.embedding import CommercialEmbedding
    provider = CommercialEmbedding()
    with pytest.raises(PermissionError, match="CLOUD_CONSENT_REQUIRED"):
        provider.index(vault, False)
    with pytest.raises(PermissionError, match="CLOUD_CONSENT_REQUIRED"):
        provider.search(vault, "private question", False)


def test_timestamp_validation_rejects_nonfinite_values():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        Segment(start=float('inf'), text="invalid")
