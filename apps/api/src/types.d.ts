import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    projectId?: string;
    apiKeyId?: string;
    dashboardAuthenticated?: boolean;
    /** GitHub numeric id of the signed-in dashboard user; absent for the owner console. */
    dashboardOwnerId?: string;
  }
}
