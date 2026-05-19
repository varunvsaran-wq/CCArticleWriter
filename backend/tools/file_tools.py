import json
from pathlib import Path


def make_file_tools(job_dir: str):
    base = Path(job_dir)

    async def read_file(path: str) -> str:
        full = base / path
        try:
            return full.read_text(encoding="utf-8")
        except FileNotFoundError:
            return f"File not found: {path}"
        except Exception as e:
            return f"Error reading {path}: {e}"

    async def write_file(path: str, content: str) -> str:
        full = base / path
        full.parent.mkdir(parents=True, exist_ok=True)
        full.write_text(content, encoding="utf-8")
        return f"Written: {path} ({len(content)} chars)"

    async def list_files(directory: str = ".") -> str:
        dir_path = base / directory
        if not dir_path.exists():
            return json.dumps([])
        files = [
            str(f.relative_to(base)).replace("\\", "/")
            for f in dir_path.rglob("*")
            if f.is_file()
        ]
        return json.dumps(sorted(files))

    return read_file, write_file, list_files
