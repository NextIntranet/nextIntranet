"""
Build/version information for the running intranet instance.

Resolution order per field: build args (env vars baked at image build time) →
a read-only mounted .git directory (dev) → sensible defaults. The .git reader is
pure Python (no git binary required), so it works in the slim runtime image.
"""
import os
from datetime import datetime, timezone
from functools import lru_cache

from django.conf import settings


def _read_ref_sha(git_dir: str, ref: str) -> str | None:
    """Resolve a ref (e.g. 'refs/heads/main') to a sha via loose or packed refs."""
    loose = os.path.join(git_dir, ref)
    if os.path.isfile(loose):
        try:
            with open(loose, "r", encoding="utf-8") as fh:
                return fh.read().strip() or None
        except OSError:
            return None

    packed = os.path.join(git_dir, "packed-refs")
    if os.path.isfile(packed):
        try:
            with open(packed, "r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line or line.startswith("#") or line.startswith("^"):
                        continue
                    sha, _, name = line.partition(" ")
                    if name == ref:
                        return sha or None
        except OSError:
            return None
    return None


def _read_git(git_dir: str) -> dict:
    """Read commit/branch/date directly from a .git directory, no git binary."""
    head_path = os.path.join(git_dir, "HEAD")
    if not os.path.isfile(head_path):
        return {}

    try:
        with open(head_path, "r", encoding="utf-8") as fh:
            head = fh.read().strip()
    except OSError:
        return {}

    commit = None
    branch = None
    date_source = head_path

    if head.startswith("ref:"):
        ref = head.split(" ", 1)[1].strip()
        branch = ref.rsplit("/", 1)[-1]
        commit = _read_ref_sha(git_dir, ref)
        loose = os.path.join(git_dir, ref)
        if os.path.isfile(loose):
            date_source = loose
    elif head:
        # Detached HEAD — raw sha.
        commit = head
        branch = "(detached)"

    info: dict = {}
    if commit:
        info["commit"] = commit
    if branch:
        info["branch"] = branch
    try:
        mtime = os.path.getmtime(date_source)
        info["build_date"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
    except OSError:
        pass
    return info


@lru_cache(maxsize=1)
def get_build_info() -> dict:
    git = _read_git(getattr(settings, "GIT_DIR", "/app/.gitinfo"))

    commit = os.getenv("GIT_COMMIT") or git.get("commit") or "unknown"
    branch = os.getenv("GIT_BRANCH") or git.get("branch") or "unknown"
    build_date = os.getenv("BUILD_DATE") or git.get("build_date")
    build_method = os.getenv("BUILD_METHOD") or (
        "development" if getattr(settings, "DEBUG", False) else "production"
    )
    github_url = getattr(
        settings, "GITHUB_REPO_URL", "https://github.com/NextIntranet/nextIntranet"
    ).rstrip("/")

    known = commit != "unknown"
    return {
        "commit": commit,
        "commit_short": commit[:7] if known else commit,
        "branch": branch,
        "build_date": build_date,
        "build_method": build_method,
        "github_url": github_url,
        "commit_url": f"{github_url}/commit/{commit}" if known else None,
    }
