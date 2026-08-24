import { FastifyInstance } from 'fastify';
import { AccessPolicyService } from '../auth/access-policy.service.js';
import { Permission } from '../auth/permission.enum.js';
import { requirePermission } from '../auth/require-permission.hook.js';
import { InvalidSiteDocumentError } from '../content/invalid-site-document.error.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { sendProblem } from '../shared/send-problem.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { ReleaseService } from './release.service.js';

const releaseIdPattern = '^[a-z0-9][a-z0-9-]{0,63}$';

export function registerReleaseRoutes(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  releaseService: ReleaseService,
): void {
  app.get('/api/v1/releases', {
    preHandler: requirePermission(accessPolicy, Permission.ReleaseRead),
  }, async (_request, reply) => reply.header('Cache-Control', 'no-store').send(await releaseService.list()));

  app.post<{
    Headers: { 'if-match'?: string };
  }>('/api/v1/releases', {
    preHandler: requirePermission(accessPolicy, Permission.Publish),
  }, async (request, reply) => handleReleaseMutation(
    request.headers['if-match'],
    reply,
    201,
    (expectedDraftEtag) => releaseService.publish(request, expectedDraftEtag),
  ));

  app.post<{
    Headers: { 'if-match'?: string };
    Params: { releaseId: string };
  }>('/api/v1/releases/:releaseId/rollback', {
    preHandler: requirePermission(accessPolicy, Permission.Rollback),
    schema: {
      params: {
        type: 'object',
        required: ['releaseId'],
        properties: { releaseId: { type: 'string', pattern: releaseIdPattern } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => handleReleaseMutation(
    request.headers['if-match'],
    reply,
    200,
    (expectedDraftEtag) => releaseService.rollback(request, request.params.releaseId, expectedDraftEtag),
  ));
}

async function handleReleaseMutation(
  ifMatch: string | undefined,
  reply: Parameters<typeof sendProblem>[0],
  successStatus: 200 | 201,
  mutate: (expectedDraftEtag: string) => ReturnType<ReleaseService['publish']>,
): Promise<unknown> {
  const suppliedEtag = ifMatch?.trim();

  if (suppliedEtag === undefined || suppliedEtag === '')
    return sendProblem(reply, 428, 'Precondition required', 'Send the current draft ETag in the If-Match header.');

  const expectedDraftEtag = normalizeStrongEtag(suppliedEtag);

  if (expectedDraftEtag === null)
    return sendProblem(reply, 400, 'Invalid precondition', 'If-Match must contain one strong ETag.');

  try {
    const result = await mutate(expectedDraftEtag);

    return reply
      .code(successStatus)
      .header('Cache-Control', 'no-store')
      .header('ETag', result.manifest.etag)
      .header('X-Draft-Synchronized', String(result.draftSynchronized))
      .send(result.manifest.value);
  } catch (error: unknown) {
    if (error instanceof PreconditionFailedError)
      return sendProblem(reply, 412, 'Precondition failed', 'The draft or published manifest changed after it was loaded.');

    if (error instanceof ResourceNotFoundError)
      return sendProblem(reply, 404, 'Resource not found', error.message);

    if (error instanceof InvalidSiteDocumentError)
      return sendProblem(
        reply,
        422,
        'Invalid site content',
        error.relationshipErrors.slice(0, 10).join(' '),
      );

    throw error;
  }
}

function normalizeStrongEtag(value: string): string | null {
  const strongEtag = value.startsWith('W/') ? value.slice(2) : value;

  return /^"[^"\r\n]+"$/.test(strongEtag) ? strongEtag : null;
}
