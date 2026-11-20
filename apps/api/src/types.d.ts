import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    projectId?: string;
    apiKeyId?: string;
    dashboardAuthenticated?: boolean;
  }
}
