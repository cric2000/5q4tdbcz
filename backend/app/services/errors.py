class InvalidAnalysisRequest(ValueError):
    """A well-formed request is outside the supported historical scope."""


class SnapshotUnavailable(RuntimeError):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)
