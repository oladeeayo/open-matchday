"""HTTP helpers shared by all provider clients."""
import time
import urllib.request
import gzip
import io
import json

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

_last_call: dict[str, float] = {}


def get(url: str, *, binary: bool = False, timeout: int = 30, retries: int = 3,
        backoff: float = 2.0) -> bytes | str:
    """GET with polite retry/backoff; returns text or raw bytes."""
    host = urllib.request.urlparse(url).netloc
    for attempt in range(1, retries + 1):
        try:
            # simple per-host 1.2s spacing to stay polite
            last = _last_call.get(host, 0.0)
            wait = 1.2 - (time.time() - last)
            if wait > 0:
                time.sleep(wait)
            _last_call[host] = time.time()

            req = urllib.request.Request(url, headers={
                "User-Agent": UA,
                "Accept-Encoding": "gzip",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding") == "gzip" or data[:2] == b"\x1f\x8b":
                    data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
                return data if binary else data.decode("utf-8", errors="replace")
        except Exception as e:  # noqa: BLE001 - log and retry
            if attempt == retries:
                raise RuntimeError(f"GET failed after {retries} tries: {url} ({e})") from e
            time.sleep(backoff * attempt)
    raise RuntimeError("unreachable")


def get_json(url: str, **kw) -> dict:
    return json.loads(get(url, **kw))
