class RetriableError(Exception):
    """Timeout, rate_limit, transient network errors. Auto-retry with backoff."""

    def __init__(self, message: str, reason: str = "unknown") -> None:
        super().__init__(message)
        self.reason = reason


class CorrectableError(Exception):
    """Invalid schema, malformed output. Retry with feedback."""

    def __init__(self, message: str, feedback: str = "") -> None:
        super().__init__(message)
        self.feedback = feedback


class EscalatableError(Exception):
    """Agent uncertain, missing data. Pause for human review."""

    def __init__(self, message: str, context: dict | None = None) -> None:
        super().__init__(message)
        self.context = context or {}


class FatalError(Exception):
    """Budget exceeded, policy violation. Stop workflow immediately."""

    def __init__(self, message: str, reason: str = "unknown") -> None:
        super().__init__(message)
        self.reason = reason
