import { FastifyReply, FastifyRequest } from 'fastify';
import { sendProblem } from '../shared/send-problem.js';
import { AccessPolicyService } from './access-policy.service.js';
import { Permission } from './permission.enum.js';

export function requirePermission(accessPolicy: AccessPolicyService, permission: Permission) {
  return async function permissionHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (request.principal === null) {
      sendProblem(reply, 401, 'Authentication required', 'A valid IAP identity is required.');
      return;
    }

    if (!accessPolicy.hasPermission(request.principal, permission)) {
      sendProblem(reply, 403, 'Access denied', 'The authenticated account does not have this permission.');
      return;
    }
  };
}
