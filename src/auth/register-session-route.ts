import { FastifyInstance } from 'fastify';
import { AccessPolicyService } from './access-policy.service.js';
import { Permission } from './permission.enum.js';
import { requirePermission } from './require-permission.hook.js';
import { SessionResponse } from './session-response.model.js';

export function registerSessionRoute(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  publishedContentBaseUrl: string,
): void {
  app.get('/api/v1/session', {
    preHandler: requirePermission(accessPolicy, Permission.SessionRead),
  }, async (request, reply) => {
    const principal = request.principal;

    if (principal === null)
      throw new Error('Authenticated session route has no principal.');

    const role = accessPolicy.getRole(principal);

    if (role === null)
      throw new Error('Authorized session route has no assigned role.');

    const response: SessionResponse = {
      subject: principal.subject,
      email: principal.email,
      role,
      permissions: accessPolicy.getPermissions(role),
      publishedContentBaseUrl,
    };

    return reply.header('Cache-Control', 'no-store').send(response);
  });
}
