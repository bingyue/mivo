import argparse
import json
import os

import anyio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def verify(args):
    params = StdioServerParameters(command=args.binary, args=["--mcp", "--vault", args.vault], env=dict(os.environ))
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            tools = await session.list_tools()
            assert len(tools.tools) == 9 and all(tool.annotations.readOnlyHint for tool in tools.tools)
            search = await session.call_tool("search_memories", {"query": "验收录音", "limit": 30})
            assert not search.isError
            text = "\n".join(item.text for item in search.content if hasattr(item, "text"))
            for source in args.source:
                assert source in text
                transcript = await session.call_tool("get_transcript", {"source_id": source})
                assert not transcript.isError
            outside = await session.call_tool("get_transcript", {"source_id": "../outside"})
            assert outside.isError
            print(json.dumps({"status": "passed", "source_count": len(args.source), "readonly_tools": len(tools.tools)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--binary", required=True)
    parser.add_argument("--vault", required=True)
    parser.add_argument("--source", required=True, action="append")
    anyio.run(verify, parser.parse_args())
