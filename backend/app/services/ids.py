import secrets
import string

_ALNUM = string.ascii_uppercase + string.digits
_NS_TLDS = ("org", "com", "net", "co.uk")


def generate_zone_id() -> str:
    """'Z' followed by 20 uppercase alphanumerics, e.g. ``Z0123456789ABCDEFGHIJ``."""
    return "Z" + "".join(secrets.choice(_ALNUM) for _ in range(20))


def generate_name_servers() -> list[str]:
    """Four delegation-set style name servers, one per TLD, like Route 53 assigns:
    ``ns-1234.awsdns-12.org.``, ``ns-567.awsdns-34.com.``, ..."""
    servers: list[str] = []
    for tld in _NS_TLDS:
        host = secrets.randbelow(2048)
        domain = secrets.randbelow(64)
        servers.append(f"ns-{host}.awsdns-{domain:02d}.{tld}.")
    return servers


def soa_value(primary_ns: str) -> str:
    """Default SOA exactly as Route 53 creates it for a new hosted zone."""
    return f"{primary_ns} awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400"
