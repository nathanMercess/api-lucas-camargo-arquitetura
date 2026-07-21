import { FastifyInstance } from 'fastify';
import { AccessPolicyService } from '../auth/access-policy.service.js';
import { Permission } from '../auth/permission.enum.js';
import { requirePermission } from '../auth/require-permission.hook.js';
import { AuditService } from './audit.service.js';

export function registerAuditRoutes(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  auditService: AuditService,
): void {
  app.get('/api/v1/audit-events', {
    preHandler: requirePermission(accessPolicy, Permission.AuditRead),
  }, async (_request, reply) => reply.header('Cache-Control', 'no-store').send(await auditService.list()));
}
