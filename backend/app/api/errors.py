from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.analysis_schemas import ErrorDetail, ErrorResponse, ValidationIssue
from app.services.errors import InvalidAnalysisRequest, SnapshotUnavailable


def register_error_handlers(application: FastAPI) -> None:
    @application.exception_handler(InvalidAnalysisRequest)
    async def invalid_scope(request: Request, exc: InvalidAnalysisRequest) -> JSONResponse:
        response = ErrorResponse(error=ErrorDetail(code="invalid_request", message=str(exc)))
        return JSONResponse(status_code=422, content=response.model_dump(mode="json"))

    @application.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, exc: RequestValidationError) -> JSONResponse:
        response = ErrorResponse(
            error=ErrorDetail(
                code="invalid_request",
                message="Request parameters are invalid.",
                issues=[
                    ValidationIssue(
                        location=list(error["loc"]), message=error["msg"], type=error["type"]
                    )
                    for error in exc.errors()
                ],
            )
        )
        return JSONResponse(status_code=422, content=response.model_dump(mode="json"))

    @application.exception_handler(SnapshotUnavailable)
    async def unavailable(request: Request, exc: SnapshotUnavailable) -> JSONResponse:
        response = ErrorResponse(error=ErrorDetail(code=exc.code, message=str(exc)))
        return JSONResponse(status_code=503, content=response.model_dump(mode="json"))
