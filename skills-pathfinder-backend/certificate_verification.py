"""Certificate extraction and verification helpers for Skills Pathfinder.

Verification is deliberately conservative. A provider URL is only a candidate
for electronic verification; `electronically_verified` is returned only after
the provider page is reached and matching credential evidence is visible.
"""

from __future__ import annotations

import html
import ipaddress
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterable, List


TRUSTED_VERIFICATION_HOST_SUFFIXES = (
    "credly.com",
    "credential.net",
    "accredible.com",
    "coursera.org",
    "udemy.com",
    "ude.my",
    "linkedin.com",
    "edx.org",
    "microsoft.com",
    "learn.microsoft.com",
    "aws.amazon.com",
    "skillbuilder.aws",
    "certmetrics.com",
    "cisco.com",
    "comptia.org",
    "google.com",
    "cloud.google.com",
    "badgr.com",
    "openbadgepassport.com",
)

# Provider-specific link shapes help us distinguish likely credential links
# from arbitrary pages on a trusted provider domain. Patterns are intentionally
# permissive enough to tolerate provider URL changes, while page evidence is
# still required before verification succeeds.
PROVIDER_LINK_PATTERNS = {
    "coursera": (
        r"^https://(?:www\.)?coursera\.org/account/accomplishments/(?:verify|certificate)/[^?#]+",
        r"^https://(?:www\.)?coursera\.org/verify/[^?#]+",
    ),
    "udemy": (
        r"^https://(?:www\.)?udemy\.com/certificate/[^?#]+",
        r"^https://ude\.my/[^?#]+",
    ),
    "linkedin_learning": (
        r"^https://(?:www\.)?linkedin\.com/learning/certificates/[^?#]+",
        r"^https://(?:www\.)?linkedin\.com/learning/.+",
    ),
    "credly": (r"^https://(?:www\.)?credly\.com/(?:badges|earner)/.+",),
    "accredible": (
        r"^https://(?:www\.)?credential\.net/.+",
        r"^https://(?:www\.)?accredible\.com/.+",
    ),
}

SUPPORTED_CERTIFICATE_EXTENSIONS = {
    ".pdf",
    ".docx",
    ".txt",
    ".png",
    ".jpg",
    ".jpeg",
}

MAX_VERIFY_RESPONSE_BYTES = 350_000
VERIFY_TIMEOUT_SECONDS = 8


def _normalize(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _host_is_trusted(hostname: str) -> bool:
    host = (hostname or "").lower().strip(".")
    return any(host == suffix or host.endswith("." + suffix) for suffix in TRUSTED_VERIFICATION_HOST_SUFFIXES)


def _ip_is_public(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def _looks_like_public_hostname(hostname: str) -> bool:
    """Reject local/private/rebinding targets before outbound verification."""
    host = (hostname or "").strip().lower().rstrip(".")
    if not host or host in {"localhost", "localhost.localdomain"}:
        return False
    if host.endswith((".local", ".internal", ".localhost")):
        return False

    # Literal IP addresses must be globally routable.
    try:
        ipaddress.ip_address(host)
        return _ip_is_public(host)
    except ValueError:
        pass

    # Resolve the hostname and reject it if any answer targets a non-public IP.
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError:
        # DNS failure will be classified as unavailable during the actual fetch.
        return True
    return bool(addresses) and all(_ip_is_public(address) for address in addresses)


def identify_verification_provider(url: str) -> str:
    normalized = (url or "").strip().lower()
    for provider, patterns in PROVIDER_LINK_PATTERNS.items():
        if any(re.match(pattern, normalized, flags=re.IGNORECASE) for pattern in patterns):
            return provider

    host = urllib.parse.urlparse(normalized).hostname or ""
    if host == "ude.my" or host.endswith(".udemy.com") or host == "udemy.com":
        return "udemy"
    if host == "coursera.org" or host.endswith(".coursera.org"):
        return "coursera"
    if host == "linkedin.com" or host.endswith(".linkedin.com"):
        return "linkedin_learning"
    if host == "credly.com" or host.endswith(".credly.com"):
        return "credly"
    return "trusted_provider" if _host_is_trusted(host) else "unknown"


def classify_verification_url(url: str) -> Dict[str, Any]:
    parsed = urllib.parse.urlparse((url or "").strip())
    hostname = parsed.hostname or ""

    if not url:
        return {
            "verification_status": "no_verification_link",
            "is_verified": False,
            "verification_method": "none",
            "verification_provider": None,
            "verification_message": "No verification link was found in the certificate.",
        }

    if parsed.scheme.lower() != "https" or not hostname or not _looks_like_public_hostname(hostname):
        return {
            "verification_status": "verification_link_invalid",
            "is_verified": False,
            "verification_method": "url_validation",
            "verification_provider": identify_verification_provider(url),
            "verification_message": "A verification link was found, but it is not a safe public HTTPS verification URL.",
        }

    if not _host_is_trusted(hostname):
        return {
            "verification_status": "verification_link_found_unconfirmed",
            "is_verified": False,
            "verification_method": "manual_review",
            "verification_provider": "unknown",
            "verification_message": "A verification link was found, but its provider is not yet in the trusted automatic-verification list.",
        }

    provider = identify_verification_provider(url)
    return {
        "verification_status": "verification_pending",
        "is_verified": False,
        "verification_method": "electronic",
        "verification_provider": provider,
        "verification_message": f"Trusted {provider.replace('_', ' ')} verification link found. Electronic verification is being attempted.",
    }


def _text_from_html(raw: bytes) -> str:
    text = raw.decode("utf-8", errors="ignore")
    text = re.sub(r"(?is)<script.*?>.*?</script>", " ", text)
    text = re.sub(r"(?is)<style.*?>.*?</style>", " ", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _evidence_terms(certificate: Dict[str, Any]) -> Iterable[str]:
    credential_id = _normalize(certificate.get("credential_id"))
    certification_name = _normalize(certificate.get("certification_name"))
    holder_name = _normalize(certificate.get("holder_name"))

    if credential_id and len(credential_id) >= 4:
        yield credential_id
    if certification_name and len(certification_name) >= 5:
        yield certification_name
    if holder_name and len(holder_name) >= 5:
        yield holder_name


def verify_certificate_url(certificate: Dict[str, Any]) -> Dict[str, Any]:
    """Attempt conservative electronic verification against a trusted host."""
    url = (certificate.get("verification_url") or "").strip()
    initial = classify_verification_url(url)
    if initial["verification_status"] != "verification_pending":
        return initial

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 SkillsPathfinder/1.0 CertificateVerification",
            "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        },
        method="GET",
    )

    try:
        with urllib.request.urlopen(request, timeout=VERIFY_TIMEOUT_SECONDS) as response:
            final_url = response.geturl()
            final_host = urllib.parse.urlparse(final_url).hostname or ""

            if not _host_is_trusted(final_host) or not _looks_like_public_hostname(final_host):
                return {
                    "verification_status": "verification_redirect_untrusted",
                    "is_verified": False,
                    "verification_method": "electronic",
                    "verification_provider": initial.get("verification_provider"),
                    "verification_message": "The trusted verification link redirected to an untrusted or non-public host, so verification was not accepted.",
                }

            raw = response.read(MAX_VERIFY_RESPONSE_BYTES + 1)
            if len(raw) > MAX_VERIFY_RESPONSE_BYTES:
                raw = raw[:MAX_VERIFY_RESPONSE_BYTES]

            page_text = _normalize(_text_from_html(raw))
            evidence = [term for term in _evidence_terms(certificate) if term in page_text]

            credential_id = _normalize(certificate.get("credential_id"))
            cert_name = _normalize(certificate.get("certification_name"))
            holder_name = _normalize(certificate.get("holder_name"))

            credential_match = bool(credential_id and credential_id in page_text)
            name_match = bool(cert_name and cert_name in page_text)
            holder_match = bool(holder_name and holder_name in page_text)

            # Strong proof: exact credential/reference ID. Otherwise require both
            # certificate title and learner name to avoid false positives.
            if credential_match or (name_match and holder_match):
                return {
                    "verification_status": "electronically_verified",
                    "is_verified": True,
                    "verification_method": "electronic",
                    "verification_provider": initial.get("verification_provider"),
                    "verification_message": "The provider verification page was reached and contained matching certificate evidence.",
                    "verification_evidence": evidence,
                    "verified_url": final_url,
                }

            return {
                "verification_status": "verification_page_reached_unconfirmed",
                "is_verified": False,
                "verification_method": "electronic",
                "verification_provider": initial.get("verification_provider"),
                "verification_message": "The provider verification page was reached, but enough matching evidence was not visible to verify automatically.",
                "verification_evidence": evidence,
                "verified_url": final_url,
            }

    except urllib.error.HTTPError as exc:
        return {
            "verification_status": "verification_unavailable",
            "is_verified": False,
            "verification_method": "electronic",
            "verification_provider": initial.get("verification_provider"),
            "verification_message": f"The provider verification page could not be confirmed automatically (HTTP {exc.code}).",
        }
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        return {
            "verification_status": "verification_unavailable",
            "is_verified": False,
            "verification_method": "electronic",
            "verification_provider": initial.get("verification_provider"),
            "verification_message": f"Automatic verification could not reach the provider page: {exc}",
        }


def normalize_certificate_skills(skills: Any) -> List[Dict[str, Any]]:
    """Normalize AI certificate skills into the same structure as resume skills."""
    if not isinstance(skills, list):
        return []

    unique: Dict[str, Dict[str, Any]] = {}
    for item in skills:
        if isinstance(item, str):
            item = {"name": item}
        if not isinstance(item, dict):
            continue

        name = re.sub(r"\s+", " ", str(item.get("name") or "")).strip()
        if not name:
            continue

        try:
            confidence = float(item.get("confidence", 0.9))
        except (TypeError, ValueError):
            confidence = 0.9

        normalized = {
            "name": name,
            "category": item.get("category") or "Certification Skill",
            "confidence": max(0.0, min(confidence, 1.0)),
            "source": "certificate",
            "evidence": item.get("evidence") or item.get("reasoning") or "Extracted from certificate",
        }
        key = name.lower()
        if key not in unique or normalized["confidence"] > unique[key]["confidence"]:
            unique[key] = normalized

    return list(unique.values())
