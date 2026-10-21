/** Protected HTTP contract for Cataloging restoration. Only auth-provider and DB I/O are faked. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Prisma, type specimen } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

const specimenId = '44444444-4444-4444-8444-444444444444';
const curatorId = '22222222-2222-4222-8222-222222222222';
const curatorAuthId = '11111111-1111-4111-8111-111111111111';
const archivedAt = new Date('2026-01-02T00:00:00.000Z');
const actor = { id: curatorId, full_name: 'Test Curator', role: 'CURATOR' };

describe('Specimen restoration (protected HTTP)', () => {
  let app: INestApplication<App>;
  let record: specimen;
  let qualifyingLots: { id: string }[];
  let revisions: Prisma.specimen_revision_historyCreateManyInput[];
  let audits: Prisma.audit_logUncheckedCreateInput[];
  let auditFailure: boolean;
  let serializationFailures: number;

  beforeEach(async () => {
    record = {
      id: specimenId,
      collection_id: '55555555-5555-4555-8555-555555555555',
      accession_number: 'TEST-RESTORE-1',
      common_name: 'Restoration specimen',
      scientific_name: null,
      specimen_category: null,
      gender: null,
      classification_status: null,
      remarks: 'Preserve these notes',
      status: 'ARCHIVED',
      public_display_allowed: false,
      created_by: curatorId,
      updated_by: curatorId,
      archived_by: curatorId,
      created_at: new Date('2026-01-01T00:00:00.000Z'),
      updated_at: archivedAt,
      archived_at: archivedAt,
    };
    qualifyingLots = [];
    revisions = [
      {
        specimen_id: specimenId,
        changed_by: curatorId,
        field_changed: 'status',
        old_value: 'UNCATALOGED',
        new_value: 'ARCHIVED',
        source_section: 'specimen_core',
        reason: 'Original archive evidence',
        changed_at: archivedAt,
      },
    ];
    audits = [
      {
        user_id: curatorId,
        affected_record_id: specimenId,
        affected_record_type: 'specimen',
        action: 'ARCHIVE_SPECIMEN',
        module: 'specimens',
        status: 'SUCCESS',
        details: { previousStatus: 'UNCATALOGED' },
        created_at: archivedAt,
      },
    ];
    auditFailure = false;
    serializationFailures = 0;

    // This DB boundary supplies only already-qualified lots, like the existing readiness SELECT.
    // It deliberately has no inventory write delegates: restoration must never need them.
    const database = {
      user_account: {
        findUnique: ({ where }: { where: { auth_user_id: string } }) => ({
          id: curatorId,
          role: where.auth_user_id === curatorAuthId ? 'CURATOR' : 'DEVELOPER',
          status: 'ACTIVE',
        }),
      },
      specimen: {
        findUnique: ({
          where,
          select,
        }: {
          where: { id: string };
          select?: { specimen_taxonomy?: unknown };
        }) =>
          where.id !== specimenId
            ? null
            : select?.specimen_taxonomy
              ? {
                  ...record,
                  specimen_taxonomy: { kingdom: 'Animalia' },
                  specimen_provenance: {
                    collection_date: new Date('2020-01-01'),
                    preservation_type: 'Wet',
                    preservation_method: 'Ethanol',
                  },
                  specimen_lot: qualifyingLots,
                }
              : { ...record },
        update: ({ data }: { data: Partial<specimen> }) => {
          record = { ...record, ...data };
          return { ...record };
        },
      },
      specimen_revision_history: {
        createMany: ({
          data,
        }: {
          data: Prisma.specimen_revision_historyCreateManyInput[];
        }) => {
          revisions.push(...data);
          return { count: data.length };
        },
        findMany: () =>
          revisions.map((row, index) => ({
            ...row,
            id: `revision-${index}`,
            changed_at: row.changed_at ?? new Date(),
            user_account: actor,
          })),
        count: () => revisions.length,
      },
      audit_log: {
        create: ({ data }: { data: Prisma.audit_logUncheckedCreateInput }) => {
          if (auditFailure) throw new Error('Simulated database audit failure');
          audits.push(data);
          return data;
        },
        findMany: () =>
          audits.map((row, index) => ({
            ...row,
            id: `audit-${index}`,
            created_at: row.created_at ?? new Date(),
            user_account: actor,
          })),
        count: () => audits.length,
      },
      $transaction: async (operation: unknown): Promise<unknown> => {
        if (Array.isArray(operation)) return Promise.all(operation);
        const snapshot = {
          record: { ...record },
          revisions: [...revisions],
          audits: [...audits],
        };
        try {
          const result = await (operation as (db: unknown) => Promise<unknown>)(
            database,
          );
          if (serializationFailures > 0) {
            serializationFailures -= 1;
            throw new Prisma.PrismaClientKnownRequestError(
              'Simulated write conflict',
              { code: 'P2034', clientVersion: 'test' },
            );
          }
          return result;
        } catch (error) {
          record = snapshot.record;
          revisions = snapshot.revisions;
          audits = snapshot.audits;
          throw error;
        }
      },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({
        auth: {
          getUser: (token: string) => ({
            data: {
              user: ['curator', 'developer'].includes(token)
                ? {
                    id:
                      token === 'curator'
                        ? curatorAuthId
                        : '33333333-3333-4333-8333-333333333333',
                    app_metadata: {},
                  }
                : null,
            },
            error: null,
          }),
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useLogger(false);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const restorePath = `/specimens/${specimenId}/restore`;
  const missingLot =
    'An active lot has positive quantity in a specimen-holding storage location';

  it('restores an incomplete archive as Uncataloged, retaining identity and explaining missing requirements', async () => {
    const response = await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        id: specimenId,
        accessionNumber: 'TEST-RESTORE-1',
        remarks: 'Preserve these notes',
        status: 'UNCATALOGED',
        publicDisplay: false,
        archivedAt: null,
        archivedBy: null,
        updatedBy: curatorId,
        restored: true,
        missingRequirements: [missingLot],
      }),
    );
    const persisted = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(persisted.body.status).toBe('UNCATALOGED');
    expect(persisted.body.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('restores a currently complete archive as Cataloged, but never publicly eligible', async () => {
    qualifyingLots = [{ id: '88888888-8888-4888-8888-888888888888' }];
    record.public_display_allowed = true; // Legacy inconsistent data must not be republished.
    const response = await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .send({ status: 'UNCATALOGED', publicDisplay: true })
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'CATALOGED',
        publicDisplay: false,
        archivedAt: null,
        archivedBy: null,
        restored: true,
        missingRequirements: [],
      }),
    );
    const history = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldChanged: 'public_display_allowed',
          oldValue: 'true',
          newValue: 'false',
        }),
      ]),
    );
  });

  it('ignores a caller-selected Cataloged status when the current checklist is incomplete', async () => {
    const response = await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .send({ status: 'CATALOGED', publicDisplay: true })
      .expect(200);
    expect(response.body.status).toBe('UNCATALOGED');
    expect(response.body.publicDisplay).toBe(false);
  });

  it('preserves original archive evidence and records the restoring actor, result, and missing requirements', async () => {
    await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    const history = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(history.body.total).toBe(2);
    expect(history.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          oldValue: 'UNCATALOGED',
          newValue: 'ARCHIVED',
          reason: 'Original archive evidence',
        }),
        expect.objectContaining({
          fieldChanged: 'status',
          oldValue: 'ARCHIVED',
          newValue: 'UNCATALOGED',
          changedBy: {
            id: curatorId,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
        }),
      ]),
    );
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(audit.body.total).toBe(2);
    expect(audit.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'ARCHIVE_SPECIMEN' }),
        expect.objectContaining({
          action: 'RESTORE_SPECIMEN',
          result: 'SUCCESS',
          affectedRecordId: specimenId,
          actor: { id: curatorId, fullName: 'Test Curator', role: 'CURATOR' },
          createdAt: expect.any(String),
          details: {
            previousStatus: 'ARCHIVED',
            restoredStatus: 'UNCATALOGED',
            archivedAt: '2026-01-02T00:00:00.000Z',
            archivedBy: curatorId,
            missingRequirements: [missingLot],
          },
        }),
      ]),
    );
  });

  it('makes retries no-ops without duplicate history or resetting later public eligibility', async () => {
    qualifyingLots = [{ id: '88888888-8888-4888-8888-888888888888' }];
    await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/public-display`)
      .set('Authorization', 'Bearer curator')
      .send({ publicDisplay: true })
      .expect(200);
    const before = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const retry = await request(app.getHttpServer())
        .patch(restorePath)
        .set('Authorization', 'Bearer curator')
        .expect(200);
      expect(retry.body).toEqual({
        ...before.body,
        restored: false,
        missingRequirements: [],
      });
    }
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(audit.body.total).toBe(3); // Original archive, one restore, one explicit public-eligibility change.
    const history = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(history.body.total).toBe(3);
  });

  it.each(['status', 'timestamp'])(
    'recognizes legacy archives indicated only by %s',
    async (marker) => {
      if (marker === 'status') record.archived_at = null;
      else record.status = 'CATALOGED';
      const response = await request(app.getHttpServer())
        .patch(restorePath)
        .set('Authorization', 'Bearer curator')
        .expect(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          restored: true,
          status: 'UNCATALOGED',
          archivedAt: null,
          archivedBy: null,
        }),
      );
    },
  );

  it.each([
    ['no token', undefined, 401],
    ['invalid token', 'bad', 401],
    ['Developer', 'developer', 403],
  ] as const)(
    'denies %s without restoring the record',
    async (_name, token, status) => {
      const attempt = request(app.getHttpServer()).patch(restorePath);
      if (token) attempt.set('Authorization', `Bearer ${token}`);
      await attempt.expect(status);
      const persisted = await request(app.getHttpServer())
        .get(`/specimens/${specimenId}`)
        .set('Authorization', 'Bearer curator')
        .expect(200);
      expect(persisted.body.status).toBe('ARCHIVED');
    },
  );

  it.each([
    ['not-a-uuid', 400],
    ['99999999-9999-4999-8999-999999999999', 404],
  ] as const)('rejects an invalid or missing record %s', async (id, status) => {
    await request(app.getHttpServer())
      .patch(`/specimens/${id}/restore`)
      .set('Authorization', 'Bearer curator')
      .expect(status);
  });

  it('leaves the archive and its history intact if the transactional audit write fails', async () => {
    auditFailure = true;
    await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(500);
    auditFailure = false;
    const persisted = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(persisted.body.status).toBe('ARCHIVED');
    const history = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(history.body.total).toBe(1);
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(audit.body.total).toBe(1);
  });

  it('retries a simulated serialization conflict without duplicate restoration history', async () => {
    serializationFailures = 1;
    await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(audit.body.total).toBe(2);
  });

  it('does not invent a status change when repairing an archive marked only by timestamp', async () => {
    record.status = 'CATALOGED';
    qualifyingLots = [{ id: '88888888-8888-4888-8888-888888888888' }];
    const response = await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'CATALOGED',
        restored: true,
        archivedAt: null,
      }),
    );
    const history = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(history.body.total).toBe(1);
    const audit = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(audit.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'RESTORE_SPECIMEN',
          details: expect.objectContaining({
            previousStatus: 'CATALOGED',
            restoredStatus: 'CATALOGED',
            archivedAt: '2026-01-02T00:00:00.000Z',
          }),
        }),
      ]),
    );
  });

  it('returns a recoverable conflict after repeated serialization failures', async () => {
    serializationFailures = 3;
    await request(app.getHttpServer())
      .patch(restorePath)
      .set('Authorization', 'Bearer curator')
      .expect(409);
    const persisted = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}`)
      .set('Authorization', 'Bearer curator')
      .expect(200);
    expect(persisted.body.status).toBe('ARCHIVED');
  });
});
