# Run from the project root directory
# Usage: .\start_backend.ps1

$env:PYTHONPATH = (Get-Location).Path
uvicorn backend.main:app --reload --port 8000
