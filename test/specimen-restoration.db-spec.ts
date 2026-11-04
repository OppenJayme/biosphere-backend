/** Legacy restoration through public services and owned SQL; no shared data or login. */
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpecimensService } from '../src/specimens/specimens.service';
import { SpecimenCatalogingService } from '../src/specimens/specimen-cataloging.service';
import { SpecimenAccessionService } from '../src/specimens/specimen-accession.service';
import { ListSpecimenRevisionsQueryDto } from '../src/specimens/dto/list-specimen-revisions-query.dto';
import { SpecimenLotsService } from '../src/specimen-lots/specimen-lots.service';
import { ListLotHistoryQueryDto } from '../src/specimen-lots/dto/list-lot-history-query.dto';
import { AuditService } from '../src/audit/audit.service';
import { ListAuditLogsQueryDto } from '../src/audit/dto/list-audit-logs-query.dto';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';

describe('Complete legacy restoration on owned PostgreSQL (CAT-016)', () => {
  let database: DisposableFaqPostgres;
  let prisma: PrismaService;
  let catalog: SpecimensService;
  let readiness: SpecimenCatalogingService;
  let lots: SpecimenLotsService;
  let audit: AuditService;
  const actor = '11111111-1111-4111-8111-111111111111';
  const specimenId = '70000000-0000-4000-8000-000000000001';
  const activeLot = '70000000-0000-4000-8000-000000000002';
  const inactiveLot = '70000000-0000-4000-8000-000000000003';
  const storage = '70000000-0000-4000-8000-000000000004';
  const createdAt = new Date('2025-01-01T00:00:00Z');
  const archivedAt = new Date('2025-02-01T00:00:00Z');

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('restoration');
    await database.createRole('service_role');
    // External auth FK only: this does not emulate Supabase authentication.
    await database.admin.query(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id UUID PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${actor}');
    `);
    await database.admin.query(
      readFileSync(
        resolve(__dirname, '../prisma/migrations/0_init/migration.sql'),
        'utf8',
      ),
    );
    // An archive with an active lot is a defensive legacy state, not a new
    // supported archive workflow. Only the owned privileged seeder creates it.
    await database.admin.query(`
      INSERT INTO user_account (id,auth_user_id,full_name,role,status) VALUES
        ('${actor}','${actor}','Synthetic curator','CURATOR','ACTIVE');
      INSERT INTO collection (id,collection_name) VALUES
        ('70000000-0000-4000-8000-000000000005','Synthetic legacy collection');
      INSERT INTO specimen (id,collection_id,created_by,archived_by,accession_number,common_name,status,public_display_allowed,remarks,created_at,archived_at) VALUES
        ('${specimenId}','70000000-0000-4000-8000-000000000005','${actor}','${actor}','TEST-LEGACY-RESTORE','Synthetic legacy specimen','ARCHIVED',false,'Retain legacy notes','2025-01-01T00:00:00Z','2025-02-01T00:00:00Z');
      INSERT INTO specimen_taxonomy (specimen_id,kingdom) VALUES ('${specimenId}','Animalia');
      INSERT INTO specimen_provenance (specimen_id,collection_date,preservation_type,preservation_method) VALUES
        ('${specimenId}','2024-01-01','Dry','Pinned');
      INSERT INTO storage_unit (id,unit_type,label,storage_type,holds_specimens) VALUES
        ('${storage}','DRAWER','Synthetic drawer','DRY',true);
      INSERT INTO specimen_lot (id,specimen_id,storage_unit_id,condition_class,quantity,is_active,created_by) VALUES
        ('${activeLot}','${specimenId}','${storage}','Good',3,true,'${actor}'),
        ('${inactiveLot}','${specimenId}','${storage}','Good',9,false,'${actor}');
      INSERT INTO specimen_revision_history (specimen_id,changed_by,field_changed,old_value,new_value,source_section,changed_at) VALUES
        ('${specimenId}','${actor}','status','UNCATALOGED','ARCHIVED','specimen_core','2025-02-01T00:00:00Z');
      INSERT INTO audit_log (user_id,affected_record_id,affected_record_type,action,module,details,status,created_at) VALUES
        ('${actor}','${specimenId}','specimen','ARCHIVE_SPECIMEN','specimens','{}','SUCCESS','2025-02-01T00:00:00Z');
      GRANT USAGE ON SCHEMA public TO service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT UPDATE ON specimen TO service_role;
      GRANT INSERT ON specimen_revision_history, audit_log TO service_role;
    `);
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: database.url('service_role') }),
    );
    await prisma.$connect();
    readiness = new SpecimenCatalogingService(prisma);
    catalog = new SpecimensService(
      prisma,
      readiness,
      new SpecimenAccessionService(prisma),
    );
    lots = new SpecimenLotsService(prisma);
    audit = new AuditService(prisma);
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await database?.close();
    }
  });

  it('revalidates to Cataloged with public display off, retains inventory/history and retries without another event', async () => {
    const original = await catalog.findOne(specimenId);
    expect(original).toMatchObject({
      status: 'ARCHIVED',
      publicDisplay: false,
    });
    expect(await readiness.getReadiness(specimenId)).toMatchObject({
      requirementsMet: true,
      canComplete: false,
      missingRequirements: [],
    });
    const originalLots = await lots.findActive(specimenId, {
      includeInactive: true,
    });
    expect(originalLots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: activeLot,
          quantity: 3,
          isActive: true,
          storageUnitId: storage,
        }),
        expect.objectContaining({
          id: inactiveLot,
          quantity: 9,
          isActive: false,
          storageUnitId: storage,
        }),
      ]),
    );
    const historyBefore = await lots.findHistory(
      specimenId,
      new ListLotHistoryQueryDto(),
    );
    const result = await catalog.restore(specimenId, actor);
    expect(result).toMatchObject({
      id: specimenId,
      restored: true,
      status: 'CATALOGED',
      publicDisplay: false,
      archivedAt: null,
      archivedBy: null,
      updatedBy: actor,
      accessionNumber: 'TEST-LEGACY-RESTORE',
      createdAt,
      remarks: 'Retain legacy notes',
      missingRequirements: [],
    });
    expect(await catalog.findOne(specimenId)).toMatchObject({
      id: specimenId,
      status: 'CATALOGED',
      publicDisplay: false,
      accessionNumber: 'TEST-LEGACY-RESTORE',
      createdAt,
      archivedAt: null,
      archivedBy: null,
      remarks: 'Retain legacy notes',
    });
    expect(
      await lots.findActive(specimenId, { includeInactive: true }),
    ).toEqual(originalLots);
    expect(await lots.summarize(specimenId)).toEqual({
      specimenId,
      activeLotCount: 1,
      totalQuantity: 3,
    });
    expect(
      await lots.findHistory(specimenId, new ListLotHistoryQueryDto()),
    ).toEqual(historyBefore);
    const revisions = await catalog.findRevisionHistory(
      specimenId,
      new ListSpecimenRevisionsQueryDto(),
    );
    expect(revisions.total).toBe(2);
    expect(revisions.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldChanged: 'status',
          oldValue: 'UNCATALOGED',
          newValue: 'ARCHIVED',
        }),
        expect.objectContaining({
          fieldChanged: 'status',
          oldValue: 'ARCHIVED',
          newValue: 'CATALOGED',
          changedBy: expect.objectContaining({ id: actor }),
        }),
      ]),
    );
    const query = Object.assign(new ListAuditLogsQueryDto(), {
      affectedRecordId: specimenId,
    });
    const events = await audit.findAll(query);
    expect(events.total).toBe(2);
    expect(events.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'ARCHIVE_SPECIMEN' }),
        expect.objectContaining({
          action: 'RESTORE_SPECIMEN',
          actor: expect.objectContaining({ id: actor }),
          result: 'SUCCESS',
          details: {
            previousStatus: 'ARCHIVED',
            restoredStatus: 'CATALOGED',
            archivedAt: archivedAt.toISOString(),
            archivedBy: actor,
            missingRequirements: [],
          },
        }),
      ]),
    );
    expect(await catalog.restore(specimenId, actor)).toMatchObject({
      restored: false,
      status: 'CATALOGED',
      publicDisplay: false,
    });
    expect(
      await catalog.findRevisionHistory(
        specimenId,
        new ListSpecimenRevisionsQueryDto(),
      ),
    ).toEqual(revisions);
    expect(await audit.findAll(query)).toEqual(events);
  });
});
