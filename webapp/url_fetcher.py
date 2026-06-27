"""
URL fetching for the Fiat Lux webapp.

Delegates entirely to fiat_lux_agents.fetch_url — all fetch logic,
SSRF protection, and HTML extraction live in the library.
"""

from fiat_lux_agents import fetch_url, is_safe_url

__all__ = ["fetch_url", "is_safe_url"]
