"""Rate limiting, keyed by client IP. Only matters once the API is reachable
from the public internet — on localhost there's no one else to rate-limit.
Auth endpoints get tighter limits since they're what a credential-stuffing or
account-enumeration attempt would actually hit."""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])
