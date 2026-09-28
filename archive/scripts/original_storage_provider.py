"""Provider boundary for private Archive illustration originals.

The active provider remains Supabase. This module keeps original-object storage
behind a small contract so a future R2/S3-compatible adapter can replace it
without changing illustration selection, registry, derivatives, or site
publication.

R2 is intentionally fail-closed until a dedicated adapter is implemented and
verified. Selecting it must never silently fall back to Supabase.
"""
from dataclasses import dataclass
import os
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request


DEFAULT_PROVIDER = "supabase"
DEFAULT_SUPABASE_URL = "https://jgsxpdflgkqroecfjzxq.supabase.co"
DEFAULT_SUPABASE_BUCKET = "survival-archive-originals"


def demand(ok, code):
    if not ok:
        raise ValueError(code)


@dataclass(frozen=True)
class OriginalStorageSelection:
    provider: str
    bucket: str
    endpoint: str


def load_original_storage_selection(env=None):
    env = os.environ if env is None else env
    provider = (env.get("ARCHIVE_ORIGINAL_STORAGE_PROVIDER", DEFAULT_PROVIDER) or DEFAULT_PROVIDER).strip().lower()

    if provider == "supabase":
        endpoint = (env.get("ARCHIVE_SUPABASE_URL", DEFAULT_SUPABASE_URL) or "").rstrip("/")
        bucket = (env.get("ARCHIVE_ORIGINAL_STORAGE_BUCKET", DEFAULT_SUPABASE_BUCKET) or "").strip()
        demand(endpoint.startswith("https://") and bool(bucket), "SUPABASE_STORAGE_CONFIG_INVALID")
        return OriginalStorageSelection(provider=provider, bucket=bucket, endpoint=endpoint)

    if provider == "r2":
        endpoint = (env.get("ARCHIVE_R2_ENDPOINT", "") or "").rstrip("/")
        bucket = (env.get("ARCHIVE_R2_BUCKET", "") or "").strip()
        demand(endpoint.startswith("https://") and bool(bucket), "R2_STORAGE_NOT_CONFIGURED")
        return OriginalStorageSelection(provider=provider, bucket=bucket, endpoint=endpoint)

    raise ValueError("STORAGE_PROVIDER_UNSUPPORTED")


class SupabaseOriginalStorage:
    provider_id = "supabase"

    def __init__(self, selection, opener, limit, env=None):
        self.selection = selection
        self.opener = opener
        self.limit = limit
        self.env = os.environ if env is None else env

    @property
    def bucket(self):
        return self.selection.bucket

    def _trusted_headers(self):
        key = self.env.get("ARCHIVE_SUPABASE_SERVICE_ROLE_KEY", "")
        demand(len(key) >= 20, "STORAGE_CREDENTIALS_REQUIRED")
        return {"apikey": key, "Authorization": f"Bearer {key}"}

    def registry_object_path(self, path):
        # Preserve the existing visual_assets object_path contract.
        return f"{self.bucket}/{path}"

    def readback(self, path, missing_ok=False):
        url = (
            f"{self.selection.endpoint}/storage/v1/object/authenticated/"
            f"{self.bucket}/{quote(path, safe='/')}"
        )
        try:
            with self.opener.open(Request(url, headers=self._trusted_headers()), timeout=30) as response:
                demand(response.status == 200, "STORAGE_READBACK_FAILED")
                data = response.read(self.limit + 1)
        except HTTPError as error:
            if missing_ok and error.code in (400, 404):
                return None
            raise ValueError(f"STORAGE_HTTP_ERROR_{error.code}") from None
        except URLError:
            raise ValueError("STORAGE_NETWORK_ERROR") from None
        demand(len(data) <= self.limit, "STORAGE_OBJECT_TOO_LARGE")
        return data

    def issue_upload_grant(self, path):
        url = (
            f"{self.selection.endpoint}/storage/v1/object/upload/sign/"
            f"{self.bucket}/{quote(path, safe='/')}"
        )
        request = Request(
            url,
            data=b"{}",
            method="POST",
            headers={**self._trusted_headers(), "Content-Type": "application/json"},
        )
        try:
            with self.opener.open(request, timeout=30) as response:
                demand(response.status in (200, 201), "STORAGE_SIGN_FAILED")
                payload = response.read(8193)
        except HTTPError as error:
            raise ValueError(f"STORAGE_HTTP_ERROR_{error.code}") from None
        except URLError:
            raise ValueError("STORAGE_NETWORK_ERROR") from None

        demand(len(payload) <= 8192, "STORAGE_SIGN_RESPONSE_INVALID")
        import json
        signed = urlparse(json.loads(payload).get("url", ""))
        demand(
            not signed.scheme
            and not signed.netloc
            and signed.path == f"/object/upload/sign/{self.bucket}/{path}",
            "STORAGE_SIGN_RESPONSE_INVALID",
        )
        tokens = parse_qs(signed.query).get("token", [])
        demand(len(tokens) == 1, "STORAGE_SIGN_RESPONSE_INVALID")
        return tokens[0]

    def upload_url(self, path, grant):
        demand(isinstance(grant, str) and 20 <= len(grant) <= 4096, "SIGNED_TOKEN_INVALID")
        return (
            f"{self.selection.endpoint}/storage/v1/object/upload/sign/"
            f"{self.bucket}/{quote(path, safe='/')}?token={quote(grant, safe='')}"
        )


def build_original_storage_provider(opener, limit, env=None):
    selection = load_original_storage_selection(env)

    if selection.provider == "supabase":
        return SupabaseOriginalStorage(selection, opener, limit, env=env)

    if selection.provider == "r2":
        # Deliberately explicit: configuration may be prepared before the
        # adapter exists, but production must never silently use another store.
        raise ValueError("R2_STORAGE_ADAPTER_NOT_IMPLEMENTED")

    raise ValueError("STORAGE_PROVIDER_UNSUPPORTED")
