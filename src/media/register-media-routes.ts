import { FastifyInstance } from 'fastify';
import { AccessPolicyService } from '../auth/access-policy.service.js';
import { Permission } from '../auth/permission.enum.js';
import { requirePermission } from '../auth/require-permission.hook.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { sendProblem } from '../shared/send-problem.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { MediaNotReadyError } from './media-not-ready.error.js';
import { MediaUploadRequest } from './media-upload-request.model.js';
import { MediaService } from './media.service.js';

const uploadRequestSchema = {
  type: 'object',
  required: ['fileName', 'mimeType', 'sizeBytes', 'sha256', 'width', 'height', 'provenance'],
  properties: {
    fileName: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
      pattern: '^(?!.*\\.\\.)(?!.*[. ]$)[A-Za-z0-9][A-Za-z0-9._ -]*$',
    },
    mimeType: { enum: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] },
    sizeBytes: { type: 'integer', minimum: 1, maximum: 20 * 1024 * 1024 },
    sha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    width: { type: 'integer', minimum: 1, maximum: 20_000 },
    height: { type: 'integer', minimum: 1, maximum: 20_000 },
    provenance: { enum: ['brand', 'project', 'reference'] },
  },
  additionalProperties: false,
} as const;

export function registerMediaRoutes(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  mediaService: MediaService,
): void {
  app.get('/api/v1/media/assets', {
    preHandler: requirePermission(accessPolicy, Permission.MediaRead),
  }, async (_request, reply) => reply.header('Cache-Control', 'no-store').send(await mediaService.listAssets()));

  app.post<{ Body: MediaUploadRequest }>('/api/v1/media/uploads', {
    preHandler: requirePermission(accessPolicy, Permission.MediaWrite),
    schema: { body: uploadRequestSchema },
  }, async (request, reply) => reply
    .code(201)
    .header('Cache-Control', 'no-store')
    .send(await mediaService.requestUpload(request, request.body)));

  app.post<{ Params: { uploadId: string } }>('/api/v1/media/uploads/:uploadId/complete', {
    preHandler: requirePermission(accessPolicy, Permission.MediaWrite),
    schema: {
      params: {
        type: 'object',
        required: ['uploadId'],
        properties: { uploadId: { type: 'string', format: 'uuid' } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      const asset = await mediaService.completeUpload(request, request.params.uploadId);

      return reply.code(201).header('Cache-Control', 'no-store').send(asset);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError)
        return sendProblem(reply, 404, 'Upload not found', error.message);

      if (error instanceof MediaNotReadyError)
        return sendProblem(reply, 409, 'Upload not ready', error.message);

      if (error instanceof PreconditionFailedError)
        return sendProblem(reply, 409, 'Media already registered', 'This immutable media asset already exists.');

      throw error;
    }
  });
}
