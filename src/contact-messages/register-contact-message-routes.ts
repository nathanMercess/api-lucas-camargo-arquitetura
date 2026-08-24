import { FastifyInstance } from 'fastify';
import { AccessPolicyService } from '../auth/access-policy.service.js';
import { Permission } from '../auth/permission.enum.js';
import { requirePermission } from '../auth/require-permission.hook.js';
import { ResourceNotFoundError } from '../shared/resource-not-found.error.js';
import { sendProblem } from '../shared/send-problem.js';
import { PreconditionFailedError } from '../storage/precondition-failed.error.js';
import { ContactMessageListQuery } from './contact-message-list-query.model.js';
import { ContactMessageService, maximumContactMessagePageSize } from './contact-message.service.js';
import { contactMessageCursorPattern } from './contact-message-cursor.js';
import { contactMessageIdPattern } from './contact-message-storage.js';
import { ContactMessageStatus } from './contact-message-status.enum.js';
import { ContactMessageStatusUpdate } from './contact-message-status-update.model.js';
import { InvalidContactMessageCursorError } from './invalid-contact-message-cursor.error.js';

const contactMessageStatusValues = Object.values(ContactMessageStatus);
const messageIdParamsSchema = {
  type: 'object',
  required: ['messageId'],
  properties: {
    messageId: { type: 'string', pattern: contactMessageIdPattern },
  },
  additionalProperties: false,
} as const;

export function registerContactMessageRoutes(
  app: FastifyInstance,
  accessPolicy: AccessPolicyService,
  contactMessageService: ContactMessageService,
): void {
  app.get<{ Querystring: ContactMessageListQuery }>('/api/v1/contact-messages', {
    preHandler: requirePermission(accessPolicy, Permission.ContactMessageRead),
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: maximumContactMessagePageSize },
          cursor: { type: 'string', pattern: contactMessageCursorPattern },
          status: { enum: contactMessageStatusValues },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    try {
      return reply
        .header('Cache-Control', 'no-store')
        .send(await contactMessageService.list(request.query));
    } catch (error: unknown) {
      if (error instanceof InvalidContactMessageCursorError)
        return sendProblem(reply, 400, 'Invalid cursor', error.message);

      throw error;
    }
  });

  app.get<{ Params: { messageId: string } }>('/api/v1/contact-messages/:messageId', {
    preHandler: requirePermission(accessPolicy, Permission.ContactMessageRead),
    schema: { params: messageIdParamsSchema },
  }, async (request, reply) => {
    const storedMessage = await contactMessageService.get(request.params.messageId);

    if (storedMessage === null)
      return sendProblem(reply, 404, 'Contact message not found', 'The contact message does not exist.');

    return reply
      .header('Cache-Control', 'no-store')
      .header('ETag', storedMessage.etag)
      .send(storedMessage.value);
  });

  app.patch<{
    Body: ContactMessageStatusUpdate;
    Headers: { 'if-match'?: string };
    Params: { messageId: string };
  }>('/api/v1/contact-messages/:messageId/status', {
    bodyLimit: 1_024,
    preHandler: requirePermission(accessPolicy, Permission.ContactMessageWrite),
    schema: {
      params: messageIdParamsSchema,
      body: {
        type: 'object',
        required: ['status'],
        properties: { status: { enum: contactMessageStatusValues } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const expectedEtag = request.headers['if-match']?.trim();

    if (expectedEtag === undefined || expectedEtag === '')
      return sendProblem(reply, 428, 'Precondition required', 'Send the current contact message ETag in If-Match.');

    if (!/^"[^"\r\n]+"$/.test(expectedEtag))
      return sendProblem(reply, 400, 'Invalid precondition', 'If-Match must contain one strong ETag.');

    try {
      const savedMessage = await contactMessageService.updateStatus(
        request,
        request.params.messageId,
        request.body.status,
        expectedEtag,
      );

      return reply
        .header('Cache-Control', 'no-store')
        .header('ETag', savedMessage.etag)
        .send(savedMessage.value);
    } catch (error: unknown) {
      if (error instanceof ResourceNotFoundError)
        return sendProblem(reply, 404, 'Contact message not found', 'The contact message does not exist.');

      if (error instanceof PreconditionFailedError)
        return sendProblem(reply, 412, 'Precondition failed', 'The contact message changed after it was loaded.');

      throw error;
    }
  });
}
