import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code: string = "error",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function badRequest(message: string, details?: unknown): ApiError {
  return new ApiError(400, message, "bad_request", details);
}

export function unauthorized(message = "Authentication required"): ApiError {
  return new ApiError(401, message, "unauthorized");
}

export function forbidden(message = "Access denied"): ApiError {
  return new ApiError(403, message, "forbidden");
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, message, "not_found");
}

export function conflict(message: string, details?: unknown): ApiError {
  return new ApiError(409, message, "conflict", details);
}

export function tooLarge(message = "Payload too large"): ApiError {
  return new ApiError(413, message, "payload_too_large");
}

export function formatZodError(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join(".") || "(root)",
    message: issue.message,
  }));
}

export function registerErrorHandler(app: FastifyInstance, isProduction: boolean): void {
  app.setErrorHandler((error: FastifyError | ApiError | ZodError, request, reply) => {
    if (error instanceof ApiError) {
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }
    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: formatZodError(error),
        },
      });
      return;
    }
    if ("validation" in error && error.validation) {
      reply.status(400).send({
        error: { code: "validation_error", message: error.message },
      });
      return;
    }
    const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, "request failed");
    }
    reply.status(statusCode).send({
      error: {
        code: statusCode === 429 ? "rate_limited" : "internal_error",
        message:
          statusCode >= 500 && isProduction
            ? "Internal server error"
            : error.message || "Internal server error",
      },
    });
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({
      error: {
        code: "not_found",
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });
}
