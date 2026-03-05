"""
V16: processor module kept for backwards compatibility.

The worker uses worker.py as the single source of truth.
"""

from typing import Any, Dict

def process(job: Dict[str, Any]) -> Dict[str, Any]:
    raise RuntimeError("processor.py is deprecated in V16. Use worker.py.")
