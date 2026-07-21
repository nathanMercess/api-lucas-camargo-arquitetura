import { FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { ObjectStore } from '../storage/object-store.interface.js';
import { AuditAction } from './audit-action.enum.js';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('keeps the Cloud Logging evidence and does not misreport a completed mutation when R2 audit persistence fails', async () => {
    const info = vi.fn();
    const error = vi.fn();
    const objectStore: ObjectStore = {
      getJson: vi.fn(),
      listJson: vi.fn(),
      putJson: vi.fn().mockRejectedValue(new Error('audit storage unavailable')),
    };
    const request = {
      id: 'request-1',
      principal: {
        subject: 'accounts.google.com:123',
        email: 'nathan66merces@gmail.com',
      },
      log: { info, error },
    } as unknown as FastifyRequest;
    const service = new AuditService(objectStore);

    const event = await service.record(request, {
      action: AuditAction.DraftSave,
      resourceType: 'site-draft',
      resourceId: 'current',
    });

    expect(event.requestId).toBe('request-1');
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ auditPersistence: 'cloud-logging' }),
      'Admin audit event emitted.',
    );
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ auditPersistence: 'cloud-logging-only' }),
      'Admin audit event could not be persisted in R2.',
    );
  });
});
