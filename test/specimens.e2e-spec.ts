/** Protected Cataloging HTTP workflows; only database/Supabase adapters are replaced. */
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';
import { xlsxFixture } from './support/xlsx-fixture';
import { strToU8 } from 'fflate';

describe('Specimens (e2e)', () => {
  const curatorToken = 'curator-specimen-token';
  const developerToken = 'developer-specimen-token';
  const otherCuratorToken = 'other-curator-import-token';
  const otherCuratorAuthId = '99999999-9999-4999-8999-999999999999';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const collectionId = '55555555-5555-4555-8555-555555555555';
  const revisionId = '77777777-7777-4777-8777-777777777777';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let catalogReadinessRecord: Record<string, unknown>;
  let specimenDelegate: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let revisionDelegate: {
    createMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  let auditDelegate: { create: jest.Mock };
  let queryRawMock: jest.Mock;
  let provenanceRecord: Record<string, unknown> | null;
  let provenanceDelegate: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    specimenRecord = {
      id: specimenId,
      collection_id: collectionId,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      archived_by: null,
      accession_number: null,
      specimen_category: 'ZOOLOGY',
      scientific_name: 'Testus specimenus',
      common_name: 'Test specimen',
      gender: 'UNKNOWN',
      classification_status: null,
      status: 'UNCATALOGED',
      public_display_allowed: false,
      remarks: null,
      created_at: testDate,
      updated_at: testDate,
      archived_at: null,
    };
    catalogReadinessRecord = {
      id: specimenId,
      status: 'UNCATALOGED',
      archived_at: null,
      collection_id: collectionId,
      accession_number: '2026.1.1',
      common_name: 'Test specimen',
      specimen_taxonomy: { kingdom: 'Animalia' },
      specimen_provenance: {
        collection_date: new Date('2020-05-17T00:00:00.000Z'),
        preservation_type: 'Wet specimen',
        preservation_method: '70% ethanol',
      },
      specimen_lot: [{ id: '88888888-8888-4888-8888-888888888888' }],
    };

    specimenDelegate = {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        specimenRecord = { ...specimenRecord, ...data };
        return specimenRecord;
      }),
      findMany: jest.fn(() => [specimenRecord]),
      findUnique: jest.fn(
        ({ select }: { select?: Record<string, unknown> } = {}) =>
          select?.specimen_taxonomy ? catalogReadinessRecord : specimenRecord,
      ),
      count: jest.fn(() => 1),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        specimenRecord = { ...specimenRecord, ...data };
        return specimenRecord;
      }),
    };
    revisionDelegate = {
      createMany: jest.fn(() => ({ count: 1 })),
      findMany: jest.fn(() => [
        {
          id: revisionId,
          specimen_id: specimenId,
          changed_by: curatorAccountId,
          field_changed: 'common_name',
          old_value: 'Old name',
          new_value: 'Test specimen',
          reason: 'Identification corrected',
          changed_at: testDate,
          source_section: 'specimen_core',
          user_account: {
            id: curatorAccountId,
            full_name: 'Test Curator',
            role: 'CURATOR',
          },
        },
      ]),
      count: jest.fn(() => 1),
    };
    auditDelegate = { create: jest.fn(() => ({})) };
    queryRawMock = jest.fn(() => []);
    provenanceRecord = null;
    provenanceDelegate = {
      findUnique: jest.fn(() => provenanceRecord),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        provenanceRecord = { ...data };
        return provenanceRecord;
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        provenanceRecord = { ...provenanceRecord, ...data };
        return provenanceRecord;
      }),
    };

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === otherCuratorAuthId) {
              return {
                id: otherCuratorAuthId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      specimen: specimenDelegate,
      specimen_provenance: provenanceDelegate,
      collection: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === collectionId ? { id: collectionId } : null,
        ),
      },
      specimen_lot: { count: jest.fn(() => 0) },
      specimen_revision_history: revisionDelegate,
      audit_log: auditDelegate,
      $queryRaw: queryRawMock,
      $executeRaw: jest.fn(() => 1),
      $transaction: jest.fn((operation: unknown) => {
        if (Array.isArray(operation)) return Promise.all(operation);
        return Promise.resolve(
          (operation as (transaction: unknown) => unknown)(prismaMock),
        );
      }),
    };

    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === otherCuratorToken
            ? otherCuratorAuthId
            : token === developerToken
              ? developerAuthId
              : null;

      return id
        ? {
            data: {
              user: {
                id,
                email: 'specimen-test@example.com',
                app_metadata: {},
              },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .compile();

    app = moduleFixture.createNestApplication();
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
    jest.useRealTimers();
    await app.close();
  });

  describe('collection date HTTP boundary', () => {
    beforeEach(() => {
      // UTC Jan 1 is already Jan 2 in Manila. Keep HTTP/event-loop timers real.
      jest.useFakeTimers({
        now: new Date('2026-01-01T16:30:00.000Z'),
        doNotFake: [
          'nextTick',
          'setImmediate',
          'clearImmediate',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'performance',
          'hrtime',
          'queueMicrotask',
        ],
      });
    });

    it.each(['post', 'patch'] as const)(
      'accepts the Manila current date through provenance %s',
      async (method) => {
        if (method === 'patch') {
          provenanceRecord = {
            specimen_id: specimenId,
            collection_date: testDate,
            updated_at: testDate,
          };
        }
        const response = await request(app.getHttpServer())
          [method](`/specimens/${specimenId}/provenance`)
          .set('Authorization', `Bearer ${curatorToken}`)
          .send({ collectionDate: '2026-01-02' })
          .expect(method === 'post' ? 201 : 200);
        expect(response.body.collectionDate).toBe('2026-01-02');
        const read = await request(app.getHttpServer())
          .get(`/specimens/${specimenId}/provenance`)
          .set('Authorization', `Bearer ${curatorToken}`)
          .expect(200);
        expect(read.body.collectionDate).toBe('2026-01-02');
        expect(auditDelegate.create).toHaveBeenCalledTimes(1);
        expect(auditDelegate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            user_id: curatorAccountId,
            action:
              method === 'post'
                ? 'CREATE_SPECIMEN_PROVENANCE'
                : 'UPDATE_SPECIMEN_PROVENANCE',
            status: 'SUCCESS',
          }),
        });
        expect(revisionDelegate.createMany).toHaveBeenCalledWith({
          data: expect.arrayContaining([
            expect.objectContaining({
              changed_by: curatorAccountId,
              field_changed: 'collection_date',
              new_value: '2026-01-02',
            }),
          ]),
        });
      },
    );

    it('blocks completion for an existing future date without rewriting it', async () => {
      provenanceRecord = {
        specimen_id: specimenId,
        collection_date: new Date('2026-01-03T00:00:00.000Z'),
        preservation_type: 'Wet specimen',
        preservation_method: '70% ethanol',
        updated_at: testDate,
      };
      catalogReadinessRecord.specimen_provenance = provenanceRecord;
      const readiness = await request(app.getHttpServer())
        .get(`/specimens/${specimenId}/catalog-readiness`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      expect(readiness.body).toMatchObject({
        requirementsMet: false,
        canComplete: false,
        missingRequirements: [
          'A valid collection date on or before today is recorded',
        ],
      });
      const complete = await request(app.getHttpServer())
        .patch(`/specimens/${specimenId}/complete-cataloging`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      expect(complete.body.missingRequirements).toEqual([
        'A valid collection date on or before today is recorded',
      ]);
      const read = await request(app.getHttpServer())
        .get(`/specimens/${specimenId}/provenance`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      expect(read.body.collectionDate).toBe('2026-01-03');
      expect(specimenDelegate.update).not.toHaveBeenCalled();
      expect(provenanceDelegate.update).not.toHaveBeenCalled();
      expect(revisionDelegate.createMany).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
    });

    it.each(['post', 'patch'] as const)(
      'rejects tomorrow through provenance %s without writes',
      async (method) => {
        const response = await request(app.getHttpServer())
          [method](`/specimens/${specimenId}/provenance`)
          .set('Authorization', `Bearer ${curatorToken}`)
          .send({ collectionDate: '2026-01-03' })
          .expect(400);
        expect(response.body.message).toContain(
          'collectionDate must be a valid YYYY-MM-DD date on or before today (Asia/Manila)',
        );
        expect(provenanceDelegate.create).not.toHaveBeenCalled();
        expect(provenanceDelegate.update).not.toHaveBeenCalled();
        expect(specimenDelegate.update).not.toHaveBeenCalled();
        expect(revisionDelegate.createMany).not.toHaveBeenCalled();
        expect(auditDelegate.create).not.toHaveBeenCalled();
      },
    );
  });

  describe('reviewed CSV HTTP workflow', () => {
    it('rejects repeated unclosed XML tags within a bounded HTTP response time', async () => {
      const malformed = xlsxFixture(
        { Specimens: [['commonName'], ['Test']] },
        {
          'xl/padding.xml': strToU8('<c '.repeat(34_000)),
        },
      );
      const started = performance.now();
      await request(app.getHttpServer())
        .post('/specimens/import/preview')
        .set('Authorization', `Bearer ${curatorToken}`)
        .attach('file', malformed, 'malformed.xlsx')
        .expect(400);
      expect(performance.now() - started).toBeLessThan(2000);
      await request(app.getHttpServer())
        .get('/specimens')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      expect(specimenDelegate.create).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
    }, 20_000);

    const workbookPreview = (buffer: Buffer) =>
      request(app.getHttpServer())
        .post('/specimens/import/preview')
        .set('Authorization', `Bearer ${curatorToken}`)
        .attach('file', buffer, 'specimens.xlsx');

    it('reads only the named Specimens sheet and preserves text accession zeros', async () => {
      const response = await workbookPreview(
        xlsxFixture({
          Instructions: [['commonName'], ['Must not import']],
          Specimens: [
            ['commonName', 'accessionNumber'],
            ['Literal specimen', '000123'],
          ],
        }),
      ).expect(201);
      expect(response.body).toMatchObject({
        totalRows: 1,
        validRows: 1,
        rows: [
          {
            rowNumber: 1,
            data: { commonName: 'Literal specimen', accessionNumber: '000123' },
            valid: true,
          },
        ],
      });
      expect(specimenDelegate.create).not.toHaveBeenCalled();
    });

    it('normalizes a date-only Excel cell without guessing a locale date string', async () => {
      const response = await workbookPreview(
        xlsxFixture(
          {
            Specimens: [
              ['commonName', 'collectionDate'],
              ['Test', ''],
            ],
          },
          {
            'xl/styles.xml': strToU8(
              '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="14" applyNumberFormat="1"/></cellXfs></styleSheet>',
            ),
            'xl/worksheets/sheet1.xml': strToU8(
              '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>commonName</t></is></c><c r="B1" t="inlineStr"><is><t>collectionDate</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Excel date fixture</t></is></c><c r="B2" s="0"><v>43831</v></c></row></sheetData></worksheet>',
            ),
          },
        ),
      ).expect(201);
      expect(response.body.rows[0]).toMatchObject({
        valid: true,
        data: { collectionDate: '2020-01-01' },
      });
    });

    it.each([
      [
        'missing named sheet',
        () => xlsxFixture({ Sheet1: [['commonName'], ['Test']] }),
        /Specimens/,
      ],
      [
        'excess XML nesting',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/padding.xml': strToU8('<n>'.repeat(65) + '</n>'.repeat(65)),
            },
          ),
        /nesting/,
      ],
      [
        'excess attributes on one XML element',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/padding.xml': strToU8(
                '<n ' +
                  Array.from({ length: 65 }, (_, i) => `a${i}="1"`).join(' ') +
                  '/>',
              ),
            },
          ),
        /too many attributes/,
      ],
      [
        'chart workbook with a clear unsupported-feature message',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/charts/chart1.xml': strToU8(
                '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart/></c:chartSpace>',
              ),
            },
          ),
        /without charts/,
      ],
      [
        'external hyperlink with a clear removal instruction',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/worksheets/_rels/sheet1.xml.rels': strToU8(
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="link1" Target="https://example.test" TargetMode="External" Type="hyperlink"/></Relationships>',
              ),
            },
          ),
        /Remove external hyperlinks/,
      ],
      [
        'oversized coordinates outside the conventional worksheet path',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/custom.xml': strToU8(
                '<worksheet><sheetData><row r="502"><c r="A502"><v>1</v></c></row></sheetData></worksheet>',
              ),
            },
          ),
        /500/,
      ],
      [
        'duplicate attributes hidden behind a quoted greater-than sign',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/worksheets/sheet1.xml': strToU8(
                '<worksheet><sheetData><row r="1" note=">" r="502"><c r="A1"><v>1</v></c></row></sheetData></worksheet>',
              ),
            },
          ),
        /duplicate XML attributes/,
      ],
      [
        'formula with cached value',
        () =>
          xlsxFixture({
            Specimens: [['commonName'], [{ xml: '<f>1+1</f><v>2</v>' }]],
          }),
        /literal/i,
      ],
      [
        'numeric accession',
        () =>
          xlsxFixture({
            Specimens: [
              ['commonName', 'accessionNumber'],
              ['Test', 123],
            ],
          }),
        /Text/,
      ],
      [
        'duplicate headers',
        () =>
          xlsxFixture({
            Specimens: [
              ['commonName', 'common_name'],
              ['Test', 'Other'],
            ],
          }),
        /duplicate/i,
      ],
      [
        'excess rows',
        () =>
          xlsxFixture({
            Specimens: [
              ['commonName'],
              ...Array.from({ length: 501 }, () => ['Test']),
            ],
          }),
        /500/,
      ],
      [
        'sparse huge coordinate',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/worksheets/sheet1.xml': strToU8(
                '<worksheet><sheetData><row r="1048576"><c r="XFD1048576" t="inlineStr"><is><t>Test</t></is></c></row></sheetData></worksheet>',
              ),
            },
          ),
        /500/,
      ],
      [
        'expanded-size bomb',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            { 'xl/padding.xml': new Uint8Array(20 * 1024 * 1024 + 1) },
          ),
        /20 MB/,
      ],
      [
        'external link',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/externalLinks/externalLink1.xml': strToU8('<externalLink/>'),
            },
          ),
        /external/i,
      ],
      [
        'XML entity',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], ['Test']] },
            {
              'xl/padding.xml': strToU8(
                '<!DOCTYPE x [<!ENTITY x "value">]><x>&x;</x>',
              ),
            },
          ),
        /entities/i,
      ],
      [
        'spreadsheet error',
        () =>
          xlsxFixture(
            { Specimens: [['commonName'], [{ xml: '<v>#DIV/0!</v>' }]] },
            {
              'xl/worksheets/sheet1.xml': strToU8(
                '<worksheet><sheetData><row r="1"><c r="A1" t="e"><v>#DIV/0!</v></c></row></sheetData></worksheet>',
              ),
            },
          ),
        /error cells/i,
      ],
      [
        'malformed package',
        () => Buffer.from('not a workbook'),
        /valid workbook/i,
      ],
    ] as const)(
      'rejects %s before saving',
      async (_label, makeWorkbook, message) => {
        const response = await workbookPreview(makeWorkbook()).expect(400);
        expect(response.body.message).toMatch(message);
        expect(specimenDelegate.create).not.toHaveBeenCalled();
        expect(auditDelegate.create).not.toHaveBeenCalled();
      },
    );

    it('enforces the multipart upload size limit for XLSX', async () => {
      await workbookPreview(Buffer.alloc(5 * 1024 * 1024 + 1)).expect(413);
      expect(specimenDelegate.create).not.toHaveBeenCalled();
    });

    describe.each(['preview', 'commit'])('%s access', (endpoint) => {
      it.each([
        { token: undefined, status: 401, caller: 'signed out' },
        { token: 'invalid-import-token', status: 401, caller: 'invalid token' },
        { token: developerToken, status: 403, caller: 'developer' },
      ])('rejects $caller', async ({ token, status }) => {
        const pending = request(app.getHttpServer()).post(
          `/specimens/import/${endpoint}`,
        );
        if (token) pending.set('Authorization', `Bearer ${token}`);
        await pending.expect(status);
        expect(specimenDelegate.create).not.toHaveBeenCalled();
        expect(auditDelegate.create).not.toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'IMPORT_SPECIMEN',
            status: 'SUCCESS',
          }),
        });
      });
    });

    const csv = [
      'commonName,gender,collectionDate,collectionId',
      'Selected import,UNKNOWN,,',
      'Unselected import,FEMALE,,',
      'Invalid gender,BAD_VALUE,,',
      'Future date,UNKNOWN,2099-01-01,',
      'Invalid collection,UNKNOWN,,not-a-uuid',
    ].join('\n');

    const preview = (format = 'csv') =>
      request(app.getHttpServer())
        .post('/specimens/import/preview')
        .set('Authorization', `Bearer ${curatorToken}`)
        .attach(
          'file',
          format === 'xlsx'
            ? xlsxFixture({
                Specimens: csv.split('\n').map((row) => row.split(',')),
              })
            : Buffer.from(csv),
          `cataloging-http.${format}`,
        );

    it.each(['csv', 'xlsx'])(
      'commits only a selected valid %s row and reuses its record on retry',
      async (format) => {
        const reviewed = await preview(format).expect(201);
        const previewId = reviewed.body.previewId as string;
        const commit = () =>
          request(app.getHttpServer())
            .post('/specimens/import/commit')
            .set('Authorization', `Bearer ${curatorToken}`)
            .send({ previewId, rowNumbers: [1] });
        const first = await commit().expect(201);
        expect(first.body).toMatchObject({
          createdCount: 1,
          failedCount: 0,
          results: [
            {
              rowNumber: 1,
              success: true,
              specimen: {
                id: specimenId,
                commonName: 'Selected import',
                status: 'UNCATALOGED',
                publicDisplay: false,
                createdBy: curatorAccountId,
              },
            },
          ],
        });
        const retry = await commit().expect(201);
        expect(retry.body.results).toEqual(first.body.results);
        const read = await request(app.getHttpServer())
          .get(`/specimens/${specimenId}`)
          .set('Authorization', `Bearer ${curatorToken}`)
          .expect(200);
        expect(read.body).toMatchObject({
          commonName: 'Selected import',
          status: 'UNCATALOGED',
          publicDisplay: false,
        });
        expect(specimenDelegate.create).toHaveBeenCalledTimes(1);
        expect(auditDelegate.create).toHaveBeenCalledTimes(1);
        expect(auditDelegate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            user_id: curatorAccountId,
            action: 'IMPORT_SPECIMEN',
            status: 'SUCCESS',
            details: expect.objectContaining({ rowNumber: 1, previewId }),
          }),
        });
        expect(provenanceDelegate.create).not.toHaveBeenCalled();
      },
    );

    it('refuses invalid and unreviewed row numbers even when posted directly', async () => {
      const reviewed = await preview().expect(201);
      const result = await request(app.getHttpServer())
        .post('/specimens/import/commit')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ previewId: reviewed.body.previewId, rowNumbers: [3, 4, 5, 99] })
        .expect(201);
      expect(result.body).toMatchObject({ createdCount: 0, failedCount: 4 });
      expect(result.body.results).toEqual([
        {
          rowNumber: 3,
          success: false,
          errors: [
            'This row failed preview validation and cannot be committed.',
          ],
        },
        {
          rowNumber: 4,
          success: false,
          errors: [
            'This row failed preview validation and cannot be committed.',
          ],
        },
        {
          rowNumber: 5,
          success: false,
          errors: [
            'This row failed preview validation and cannot be committed.',
          ],
        },
        {
          rowNumber: 99,
          success: false,
          errors: ['This row was not part of the reviewed preview.'],
        },
      ]);
      expect(specimenDelegate.create).not.toHaveBeenCalled();
      expect(provenanceDelegate.create).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
    });

    it('does not let another curator commit a reviewed preview', async () => {
      const reviewed = await preview().expect(201);
      const result = await request(app.getHttpServer())
        .post('/specimens/import/commit')
        .set('Authorization', `Bearer ${otherCuratorToken}`)
        .send({ previewId: reviewed.body.previewId, rowNumbers: [1] })
        .expect(404);
      expect(result.body.message).toBe(
        'Import preview not found or expired. Re-run POST /specimens/import/preview before committing.',
      );
      expect(specimenDelegate.create).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
      // The denied attempt must not consume or invalidate its owner's preview.
      const owner = await request(app.getHttpServer())
        .post('/specimens/import/commit')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ previewId: reviewed.body.previewId, rowNumbers: [1] })
        .expect(201);
      expect(owner.body).toMatchObject({ createdCount: 1, failedCount: 0 });
      expect(specimenDelegate.create).toHaveBeenCalledTimes(1);
    });

    it.each(['csv', 'xlsx'])(
      'previews mixed %s rows without changing specimens or audit history',
      async (format) => {
        const before = await request(app.getHttpServer())
          .get('/specimens')
          .set('Authorization', `Bearer ${curatorToken}`)
          .expect(200);
        const result = await preview(format).expect(201);
        expect(result.body).toMatchObject({
          totalRows: 5,
          validRows: 2,
          invalidRows: 3,
        });
        const rows = result.body.rows as Array<{
          rowNumber: number;
          valid: boolean;
          errors: string[];
        }>;
        expect(rows.map((row) => [row.rowNumber, row.valid])).toEqual([
          [1, true],
          [2, true],
          [3, false],
          [4, false],
          [5, false],
        ]);
        expect(rows[2].errors.join(' ')).toContain('gender');
        expect(rows[3].errors.join(' ')).toContain('on or before today');
        expect(rows[4].errors.join(' ')).toContain('collectionId');
        const after = await request(app.getHttpServer())
          .get('/specimens')
          .set('Authorization', `Bearer ${curatorToken}`)
          .expect(200);
        expect(after.body).toEqual(before.body);
        expect(specimenDelegate.create).not.toHaveBeenCalled();
        expect(provenanceDelegate.create).not.toHaveBeenCalled();
        expect(auditDelegate.create).not.toHaveBeenCalled();
      },
    );
  });

  it('rejects a request without a Supabase access token', () =>
    request(app.getHttpServer()).get('/specimens').expect(401));

  it('rejects an active Developer because specimen routes are curator-only', () =>
    request(app.getHttpServer())
      .get('/specimens')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('validates fixed gender values before calling the database', async () => {
    await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ gender: 'UNCONFIRMED' })
      .expect(400);

    expect(specimenDelegate.create).not.toHaveBeenCalled();
  });

  it('creates an Uncataloged specimen using the BioSphere account id', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        collectionId,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
        gender: 'UNKNOWN',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: specimenId,
        collectionId,
        status: 'UNCATALOGED',
        publicDisplay: false,
        createdBy: curatorAccountId,
      }),
    );
    expect(specimenDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        created_by: curatorAccountId,
        updated_by: curatorAccountId,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalled();
  });

  it('returns duplicate warnings with a created specimen without flagging itself', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: specimenId,
        possibleDuplicates: [],
        duplicateCheckAvailable: true,
      }),
    );
  });

  it('still returns 201 with the created record when the duplicate lookup fails', async () => {
    specimenDelegate.findMany.mockImplementationOnce(() => {
      throw new Error('connection reset');
    });
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const response = await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
      })
      .expect(201);
    logSpy.mockRestore();

    // The write committed exactly once and the client gets its id, so there
    // is no ambiguous failure to retry; it can re-check duplicates later.
    expect(response.body).toEqual(
      expect.objectContaining({
        id: specimenId,
        possibleDuplicates: [],
        duplicateCheckAvailable: false,
      }),
    );
    expect(specimenDelegate.create).toHaveBeenCalledTimes(1);
    expect(auditDelegate.create).toHaveBeenCalledTimes(1);

    const recheck = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/possible-duplicates`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(recheck.body).toEqual({
      possibleDuplicates: [],
      duplicateCheckAvailable: true,
    });
  });

  describe.each([
    ['POST', '/specimens/duplicate-check'],
    ['GET', `/specimens/${specimenId}/possible-duplicates`],
  ])('%s %s authorization', (method, path) => {
    const send = () => {
      const server = request(app.getHttpServer());
      return method === 'POST'
        ? server.post(path).send({ scientificName: 'Testus specimenus' })
        : server.get(path);
    };

    it('rejects an unauthenticated request', async () => {
      await send().expect(401);
      expect(specimenDelegate.findMany).not.toHaveBeenCalled();
    });

    it('rejects an active Developer because duplicate checks are curator-only', async () => {
      await send().set('Authorization', `Bearer ${developerToken}`).expect(403);
      expect(specimenDelegate.findMany).not.toHaveBeenCalled();
    });
  });

  it('checks unsaved values for possible duplicates without saving', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens/duplicate-check')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        scientificName: '  testus specimenus ',
        commonName: 'Test specimen',
      })
      .expect(200);

    expect(response.body).toEqual({
      possibleDuplicates: [
        expect.objectContaining({
          specimenId,
          confidence: 'MEDIUM',
          matchedFields: ['SCIENTIFIC_NAME', 'COMMON_NAME'],
        }),
      ],
      duplicateCheckAvailable: true,
    });
    expect(specimenDelegate.create).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('validates duplicate-check input', () =>
    request(app.getHttpServer())
      .post('/specimens/duplicate-check')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionDate: '05/01/2026' })
      .expect(400));

  it('lists possible duplicates of a saved specimen, excluding itself', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/possible-duplicates`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      possibleDuplicates: [],
      duplicateCheckAvailable: true,
    });
  });

  it('returns active specimen records with camelCase API fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: specimenId,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        publicDisplay: false,
      }),
    ]);
    expect(specimenDelegate.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' }, archived_at: null },
      orderBy: { created_at: 'desc' },
    });
  });

  it('searches with validated filters and returns a bounded catalog page', async () => {
    specimenDelegate.findMany.mockImplementationOnce(() => [
      {
        ...specimenRecord,
        specimen_taxonomy: { family: 'Felidae' },
        specimen_provenance: null,
        specimen_lot: [],
      },
    ]);
    const response = await request(app.getHttpServer())
      .get('/specimens/search')
      .query({
        search: '  test specimen  ',
        status: 'UNCATALOGED',
        publicDisplay: 'false',
        page: '2',
        limit: '10',
        sortBy: 'scientificName',
        sortDirection: 'asc',
      })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: specimenId,
          family: 'Felidae',
          collector: null,
          totalQuantity: 0,
          conditionClasses: [],
          storageUnits: [],
        }),
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(specimenDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'UNCATALOGED',
          public_display_allowed: false,
        }),
        orderBy: [
          { scientific_name: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        skip: 10,
        take: 10,
      }),
    );
  });

  it('accepts a timestamp createdFrom on the same day as a date-only createdTo', async () => {
    specimenDelegate.findMany.mockImplementationOnce(() => []);

    await request(app.getHttpServer())
      .get('/specimens/search')
      .query({
        createdFrom: '2026-01-31T08:00:00.000Z',
        createdTo: '2026-01-31',
      })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(specimenDelegate.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          created_at: {
            gte: new Date('2026-01-31T08:00:00.000Z'),
            lte: undefined,
            lt: new Date('2026-02-01T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('rejects invalid catalog query values before accessing specimens', async () => {
    specimenDelegate.findMany.mockClear();

    await request(app.getHttpServer())
      .get('/specimens/search')
      .query({ publicDisplay: 'yes', limit: '101', sortBy: 'remarks' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/specimens/search')
      .query({ createdFrom: '2026-02-01', createdTo: '2026-01-31' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/specimens/search')
      .query({ createdFrom: 'last week', storageUnitId: 'drawer-1' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(specimenDelegate.findMany).not.toHaveBeenCalled();
  });

  it('returns protected, filtered specimen revision history', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .query({
        fieldChanged: '  common_name  ',
        sourceSection: 'specimen_core',
        changedBy: curatorAccountId,
        page: '1',
        limit: '25',
      })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: revisionId,
          specimenId,
          changedBy: {
            id: curatorAccountId,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
          fieldChanged: 'common_name',
          oldValue: 'Old name',
          newValue: 'Test specimen',
          reason: 'Identification corrected',
          sourceSection: 'specimen_core',
          changedAt: testDate.toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    expect(revisionDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          specimen_id: specimenId,
          changed_by: curatorAccountId,
          field_changed: expect.objectContaining({ equals: 'common_name' }),
          source_section: expect.objectContaining({
            equals: 'specimen_core',
          }),
        }),
        orderBy: [{ changed_at: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 25,
      }),
    );
  });

  it('protects specimen revision history from unauthenticated callers', () =>
    request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .expect(401));

  it('protects specimen revision history from Developer accounts', () =>
    request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('rejects invalid revision-history filters before querying history', async () => {
    revisionDelegate.findMany.mockClear();

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .query({ changedBy: 'not-a-uuid', limit: '101' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(revisionDelegate.findMany).not.toHaveBeenCalled();
  });

  it('updates camelCase API fields and records revision history', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ commonName: 'Updated specimen', remarks: 'Verified' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        commonName: 'Updated specimen',
        remarks: 'Verified',
        updatedBy: curatorAccountId,
      }),
    );
    expect(revisionDelegate.createMany).toHaveBeenCalled();
  });

  describe('accession-number uniqueness (REQ-4.4-04, BR-01)', () => {
    const holderId = '99999999-9999-4999-8999-999999999999';
    const holder = {
      id: holderId,
      accession_number: '2026.1.1',
      scientific_name: 'Otherus specimenus',
      common_name: null,
      status: 'ARCHIVED',
    };

    it('rejects a create that reuses an assigned number with a structured 409', async () => {
      queryRawMock.mockReturnValue([holder]);

      const response = await request(app.getHttpServer())
        .post('/specimens')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ accessionNumber: ' 2026.1.1 ' })
        .expect(409);

      expect(response.body).toEqual(
        expect.objectContaining({
          statusCode: 409,
          code: 'ACCESSION_NUMBER_TAKEN',
          accessionNumber: '2026.1.1',
          conflictingSpecimen: expect.objectContaining({
            id: holderId,
            status: 'ARCHIVED',
          }),
        }),
      );
      expect(specimenDelegate.create).not.toHaveBeenCalled();
    });

    it('rejects an update that takes another record number', async () => {
      queryRawMock.mockReturnValue([holder]);

      await request(app.getHttpServer())
        .patch(`/specimens/${specimenId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ accessionNumber: '2026.1.1' })
        .expect(409);

      expect(specimenDelegate.update).not.toHaveBeenCalled();
    });

    it('reports availability for the edited record', async () => {
      queryRawMock.mockReturnValue([holder]);

      const response = await request(app.getHttpServer())
        .get('/specimens/accession-number-availability')
        .query({ accessionNumber: '2026.1.1', excludeSpecimenId: specimenId })
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toEqual({
        accessionNumber: '2026.1.1',
        available: false,
        conflictingSpecimen: {
          id: holderId,
          accessionNumber: '2026.1.1',
          scientificName: 'Otherus specimenus',
          commonName: null,
          status: 'ARCHIVED',
        },
      });
      const [sql] = queryRawMock.mock.calls[0] as [{ values: unknown[] }];
      expect(sql.values).toEqual(['2026.1.1', specimenId]);
    });

    it('validates the availability query', () =>
      request(app.getHttpServer())
        .get('/specimens/accession-number-availability')
        .query({ accessionNumber: '   ' })
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400));

    it('limits the availability check to curators', () =>
      request(app.getHttpServer())
        .get('/specimens/accession-number-availability')
        .query({ accessionNumber: '2026.1.1' })
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403));
  });

  it('returns the server-authoritative Cataloging readiness checklist', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/catalog-readiness`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        specimenId,
        currentStatus: 'UNCATALOGED',
        requirementsMet: true,
        canComplete: true,
        missingRequirements: [],
        checks: expect.arrayContaining([
          expect.objectContaining({ key: 'kingdom', passed: true }),
          expect.objectContaining({ key: 'activeLot', passed: true }),
        ]),
      }),
    );
  });

  it('completes Cataloging only after all approved requirements pass', async () => {
    specimenRecord = {
      ...specimenRecord,
      accession_number: '2026.1.1',
      collection_id: collectionId,
    };

    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/complete-cataloging`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ status: 'CATALOGED', publicDisplay: false }),
    );
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'COMPLETE_SPECIMEN_CATALOGING',
      }),
    });
  });

  it('returns actionable missing requirements instead of completing', async () => {
    catalogReadinessRecord = {
      ...catalogReadinessRecord,
      accession_number: null,
      specimen_provenance: null,
      specimen_lot: [],
    };

    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/complete-cataloging`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        message:
          'This specimen cannot be Cataloged until every required item is complete.',
        missingRequirements: expect.arrayContaining([
          'Accession number is assigned',
          'A valid collection date on or before today is recorded',
          'An active lot has positive quantity in a specimen-holding storage location',
        ]),
      }),
    );
  });

  it('reopens Cataloging with a reason and removes public eligibility', async () => {
    specimenRecord = {
      ...specimenRecord,
      status: 'CATALOGED',
      public_display_allowed: true,
    };

    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/reopen-cataloging`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ reason: '  Taxonomy needs correction  ' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'UNCATALOGED',
        publicDisplay: false,
      }),
    );
    expect(revisionDelegate.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          field_changed: 'status',
          reason: 'Taxonomy needs correction',
        }),
      ]),
    });
  });

  it('rejects reopening without a meaningful reason', () =>
    request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/reopen-cataloging`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ reason: '   ' })
      .expect(400));

  it('prevents an Uncataloged specimen from becoming public eligible', () =>
    request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/public-display`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ publicDisplay: true })
      .expect(400));

  it('archives instead of deleting and preserves curator attribution', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/archive`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ARCHIVED',
        publicDisplay: false,
        archivedBy: curatorAccountId,
      }),
    );
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: specimenId },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        archived_by: curatorAccountId,
        updated_by: curatorAccountId,
      }),
    });
  });
});
