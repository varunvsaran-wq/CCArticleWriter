import json
from duckduckgo_search import DDGS


async def web_search(query: str, num_results: int = 6) -> str:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))
        return json.dumps([
            {
                "title": r.get("title", ""),
                "url": r.get("href", ""),
                "snippet": r.get("body", ""),
            }
            for r in results
        ], indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
