import { FastifyInstance } from 'fastify';
import { AuditAction } from '../audit/audit-action.enum.js';
import { AuditService } from '../audit/audit.service.js';
import { AccessPolicyService } from '../auth/access-policy.service.js';
import { Permission } from '../auth/permission.enum.js';
import { requirePermission } from '../auth/require-permission.hook.js';
import { sendProblem } from '../shared/send-problem.js';
import { calculateJsonSha256 } from '../shared/calculate-json-sha256.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { DraftService } from './draft.service.js';
import { SiteDocument } from './site-document.model.js';
import { siteConfigV1Schema } from './site-config-v1.schema.js';
import { validateSiteDocumentRelationships } from './validate-site-document-relationships.js';

export function registerContentRoutes(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  draftService: DraftService,
  auditService: AuditService,
): void {
  app.get('/api/v1/content/draft', {
    preHandler: requirePermission(accessPolicy, Permission.ContentRead),
  }, async (_request, reply) => {
    const draft = await draftService.getDraft();

    if (draft === null)
      return sendProblem(reply, 404, 'Draft not found', 'No draft content has been created yet.');

    return reply
      .header('Cache-Control', 'no-store')
      .header('ETag', draft.etag)
      .send(draft.value);
  });

  app.put<{
    Body: SiteDocument;
    Headers: {
      'if-match'?: string;
      'if-none-match'?: string;
    };
  }>('/api/v1/content/draft', {
    preHandler: requirePermission(accessPolicy, Permission.ContentWrite),
    schema: {
      body: siteConfigV1Schema,
    },
  }, async (request, reply) => {
    const expectedEtag = request.headers['if-match']?.trim();
    const createPrecondition = request.headers['if-none-match']?.trim();

    if (expectedEtag !== undefined && createPrecondition !== undefined)
      return sendProblem(reply, 400, 'Invalid precondition', 'Send either If-Match or If-None-Match, never both.');

    if (expectedEtag === undefined && createPrecondition === undefined)
      return sendProblem(reply, 428, 'Precondition required', 'Send If-None-Match: * to create or If-Match with the current ETag to update.');

    if (createPrecondition !== undefined && createPrecondition !== '*')
      return sendProblem(reply, 400, 'Invalid precondition', 'The first draft must use If-None-Match: *.');

    if (expectedEtag !== undefined && !/^"[^"\r\n]+"$/.test(expectedEtag))
      return sendProblem(reply, 400, 'Invalid precondition', 'If-Match must contain one strong ETag.');

    const relationshipErrors = validateSiteDocumentRelationships(request.body);

    if (relationshipErrors.length > 0)
      return sendProblem(
        reply,
        422,
        'Invalid content relationships',
        relationshipErrors.slice(0, 10).join(' '),
      );

    try {
      const currentDraft = expectedEtag === undefined ? null : await draftService.getDraft();
      const savedDraft = expectedEtag === undefined
        ? await draftService.createDraft(request.body)
        : await draftService.saveDraft(request.body, expectedEtag);

      await auditService.record(request, {
        action: expectedEtag === undefined ? AuditAction.DraftCreate : AuditAction.DraftSave,
        resourceType: 'site-draft',
        resourceId: 'current',
        ...(currentDraft === null ? {} : {
          beforeEtag: currentDraft.etag,
          beforeSha256: calculateJsonSha256(currentDraft.value),
        }),
        afterEtag: savedDraft.etag,
        afterSha256: calculateJsonSha256(savedDraft.value),
      });

      return reply
        .code(expectedEtag === undefined ? 201 : 200)
        .header('Cache-Control', 'no-store')
        .header('ETag', savedDraft.etag)
        .send(savedDraft.value);
    } catch (error: unknown) {
      if (error instanceof PreconditionFailedError)
        return sendProblem(reply, 412, 'Precondition failed', 'The draft changed after it was loaded.');

      throw error;
    }
  });
}
