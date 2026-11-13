import os
import sys

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from mivo_core.schemas import AnalysisInput
from mivo_core.vault import Vault


def test_real_stdio_client_reads_only_authorized_vault(tmp_path):
    vault = Vault(tmp_path / "authorized")
    source = vault.import_text("MCP 验收资料", "Mivo 必须保留每条知识的原始来源。")
    analysis = vault.add_analysis(AnalysisInput(source_id=source["id"], transcript_revision=1,
        model="human-authored-fixture", summary="Mivo 保留原始来源", evidence=[0]))
    vault.confirm(analysis["id"])
    other = Vault(tmp_path / "private")
    secret = other.import_text("不授权", "never disclose this")

    async def run():
        executable = os.environ.get("MIVO_MCP_EXECUTABLE")
        params = StdioServerParameters(command=executable or sys.executable,
            args=(["--mcp"] if executable else ["-m", "mivo_core.mcp_server"]) + ["--vault", str(vault.root)], env=dict(os.environ))
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                tools = await session.list_tools()
                names = {tool.name for tool in tools.tools}
                assert all(tool.annotations.readOnlyHint for tool in tools.tools)
                assert names == {"search_memories", "list_recordings", "get_transcript", "get_memory",
                                 "get_topic_context", "get_person_context", "get_project_context",
                                 "get_timeline", "search_tasks"}
                result = await session.call_tool("search_memories", {"query": "原始来源"})
                assert not result.isError
                assert source["id"] in result.content[0].text
                result = await session.call_tool("get_transcript", {"source_id": secret["id"]})
                assert result.isError
                result = await session.call_tool("get_transcript", {"source_id": "../../private/database/mivo.sqlite"})
                assert result.isError
                result = await session.call_tool("write_memory", {"text": "bad"})
                assert result.isError
    anyio.run(run)
