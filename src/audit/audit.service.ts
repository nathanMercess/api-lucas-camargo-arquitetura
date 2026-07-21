import { randomUUID } from 'node:crypto';
import { FastifyRequest } from 'fastify';
import { ObjectStore } from '../storage/object-store.interface.js';
import { AuditDetails } from './audit-details.model.js';
import { AuditEvent } from './audit-event.model.js';

const auditPrefix = 'audit/';

export class AuditService {
  public constructor(private readonly privateObjects: ObjectStore) {}

  public async record(request: FastifyRequest, details: AuditDetails): Promise<AuditEvent> {
    const principal = request.principal;

    if (principal === null)
      throw new Error('An audit event cannot be recorded without an authenticated principal.');

    const occurredAt = new Date().toISOString();
    const id = randomUUID();
    const event: AuditEvent = {
      id,
      occurredAt,
      actorId: principal.subject,
      actorEmail: principal.email,
      requestId: request.id,
      ...details,
    };
    const dayPrefix = occurredAt.slice(0, 10).replaceAll('-', '/');

    request.log.info({ audit: event, auditPersistence: 'cloud-logging' }, 'Admin audit event emitted.');

    try {
      await this.privateObjects.putJson(`${auditPrefix}${dayPrefix}/${occurredAt}-${id}.json`, event, {
        ifNoneMatch: '*',
        cacheControl: 'no-store',
      });
    } catch (error: unknown) {
      request.log.error(
        { err: error, audit: event, auditPersistence: 'cloud-logging-only' },
        'Admin audit event could not be persisted in R2.',
      );

      return event;
    }

    request.log.info({ audit: event, auditPersistence: 'r2' }, 'Admin audit event persisted.');

    return event;
  }

  public async list(): Promise<readonly AuditEvent[]> {
    const objects = await this.privateObjects.listJson<AuditEvent>(auditPrefix);

    return objects.map((object) => object.value).sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
}
