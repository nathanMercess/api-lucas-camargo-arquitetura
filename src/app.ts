import fastify, { FastifyInstance } from 'fastify';
import { AuditService } from './audit/audit.service.js';
import { registerAuditRoutes } from './audit/register-audit-routes.js';
import { AccessPolicyService } from './auth/access-policy.service.js';
import { registerAuthentication } from './auth/register-authentication.js';
import { registerSessionRoute } from './auth/register-session-route.js';
import { AppConfig } from './config/app-config.model.js';
import { DraftService } from './content/draft.service.js';
import { registerContentRoutes } from './content/register-content-routes.js';
import { MediaService } from './media/media.service.js';
import { registerMediaRoutes } from './media/register-media-routes.js';
import { registerReleaseRoutes } from './releases/register-release-routes.js';
import { ReleaseService } from './releases/release.service.js';
import { registerRequestSecurity } from './security/register-request-security.js';
import { sendProblem } from './shared/send-problem.js';
import { AdminStorage } from './storage/admin-storage.interface.js';
import { createAdminStorage } from './storage/create-admin-storage.js';

const bodyLimitInBytes = 2 * 1024 * 1024;

export async function buildApp(
  config: AppConfig,
  storage: AdminStorage = createAdminStorage(config),
): Promise<FastifyInstance> {
  const app = fastify({
    bodyLimit: bodyLimitInBytes,
    logger: config.environment === 'test' ? false : {
      level: 'info',
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers.x-goog-iap-jwt-assertion',
        'res.headers.set-cookie',
      ],
    },
    trustProxy: true,
  });
  const accessPolicy = new AccessPolicyService(config.initialOwnerEmail);
  const auditService = new AuditService(storage.privateObjects);
  const draftService = new DraftService(storage.privateObjects);
  const releaseService = new ReleaseService(
    storage.privateObjects,
    storage.publishedObjects,
    storage.media,
    draftService,
    auditService,
  );
  const mediaService = new MediaService(storage.privateObjects, storage.media, auditService);

  registerRequestSecurity(app, config);

  app.get('/healthz', async (_request, reply) => reply.code(204).send());

  registerAuthentication(app, config);
  registerSessionRoute(app, accessPolicy, config.publishedBaseUrl ?? '/content');
  registerContentRoutes(app, accessPolicy, draftService, auditService);
  registerReleaseRoutes(app, accessPolicy, releaseService);
  registerMediaRoutes(app, accessPolicy, mediaService);
  registerAuditRoutes(app, accessPolicy, auditService);

  app.setErrorHandler((error, request, reply) => {
    if (isValidationError(error)) {
      sendProblem(reply, 400, 'Invalid request', 'The request does not match the required contract.');
      return;
    }

    const clientErrorStatus = getClientErrorStatus(error);

    if (clientErrorStatus !== null) {
      const title = clientErrorStatus === 413 ? 'Payload too large' : 'Invalid request';
      sendProblem(reply, clientErrorStatus, title, 'The request could not be accepted by the admin API.');
      return;
    }

    request.log.error({ err: error }, 'Unhandled admin API error.');
    sendProblem(reply, 500, 'Internal server error', 'The request could not be completed.');
  });

  return app;
}

function isValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function getClientErrorStatus(error: unknown): 400 | 413 | 415 | null {
  if (typeof error !== 'object' || error === null || !('statusCode' in error))
    return null;

  const statusCode = error.statusCode;

  if (statusCode === 400 || statusCode === 413 || statusCode === 415)
    return statusCode;

  return null;
}
