/** Public read services with real Prisma/owned SQL; no application auth, .env or writes to shared data. */
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpecimensService } from '../src/specimens/specimens.service';
import { SpecimenCatalogingService } from '../src/specimens/specimen-cataloging.service';
import { SpecimenAccessionService } from '../src/specimens/specimen-accession.service';
import { SearchSpecimensQueryDto } from '../src/specimens/dto/search-specimens-query.dto';
import { SpecimenStatus } from '../src/specimens/entities/specimen.entity';
import { DashboardService } from '../src/dashboard/dashboard.service';
import { ReportBuilderService } from '../src/reports/report-builder.service';
import { GenerateReportDto } from '../src/reports/dto/generate-report.dto';
import { ReportFormat, ReportType } from '../src/reports/report-types';
import {
  ReportPeriodType,
  resolveReportPeriod,
} from '../src/reports/report-period';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';

describe('Archive read consistency on owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  let prisma: PrismaService;
  let catalog: SpecimensService;
  const draft = '50000000-0000-4000-8000-000000000001';
  const cataloged = '50000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('archive-reads');
    await database.createRole('service_role');
    // Minimal external-auth reference only; this fixture does not emulate Supabase login.
    await database.admin.query(`
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id UUID PRIMARY KEY);
      INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111');
    `);
    await database.admin.query(
      readFileSync(
        resolve(__dirname, '../prisma/migrations/0_init/migration.sql'),
        'utf8',
      ),
    );
    await database.admin.query(`
      INSERT INTO user_account (id, auth_user_id, full_name, role, status) VALUES
        ('11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Synthetic curator','CURATOR','ACTIVE');
      INSERT INTO specimen (id,created_by,scientific_name,common_name,specimen_category,status,archived_at) VALUES
        ('${draft}','11111111-1111-4111-8111-111111111111','Synthetic active species','Read fixture','Active','UNCATALOGED',NULL),
        ('${cataloged}','11111111-1111-4111-8111-111111111111','Synthetic active species','Read fixture','Active','CATALOGED',NULL),
        ('50000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','Synthetic archive species','Read fixture','ArchivedOnly','ARCHIVED',NULL),
        ('50000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','Synthetic archive species','Read fixture','ArchivedOnly','UNCATALOGED','2026-01-01T00:00:00Z'),
        ('50000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','Synthetic archive species','Read fixture','ArchivedOnly','ARCHIVED','2026-01-01T00:00:00Z');
      INSERT INTO storage_unit (id,unit_type,label,storage_type,holds_specimens) VALUES
        ('60000000-0000-4000-8000-000000000001','DRAWER','Synthetic drawer','DRY',true);
      INSERT INTO specimen_lot (specimen_id,storage_unit_id,condition_class,quantity,created_by) VALUES
        ('${draft}','60000000-0000-4000-8000-000000000001','Good',3,'11111111-1111-4111-8111-111111111111'),
        ('${cataloged}','60000000-0000-4000-8000-000000000001','Good',4,'11111111-1111-4111-8111-111111111111'),
        ('50000000-0000-4000-8000-000000000004','60000000-0000-4000-8000-000000000001','Good',99,'11111111-1111-4111-8111-111111111111');
      GRANT USAGE ON SCHEMA public TO service_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO service_role;
    `);
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: database.url('service_role') }),
    );
    await prisma.$connect();
    catalog = new SpecimensService(
      prisma,
      new SpecimenCatalogingService(prisma),
      new SpecimenAccessionService(prisma),
    );
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await database?.close();
    }
  });

  it('default catalog search excludes either archive indicator in rows and total', async () => {
    const result = await catalog.search(new SearchSpecimensQueryDto());
    expect({
      ids: result.items.map((item) => item.id).sort(),
      total: result.total,
    }).toEqual({ ids: [draft, cataloged], total: 2 });
  });

  it('legacy catalog list excludes either archive indicator', async () => {
    expect((await catalog.findAll()).map((item) => item.id).sort()).toEqual([
      draft,
      cataloged,
    ]);
  });

  it('dashboard active breakdowns and queue exclude archives while historical totals remain', async () => {
    const result = await new DashboardService(prisma).getSummary(
      new Date('2026-11-04T00:00:00Z'),
    );
    expect({
      categories: result.specimens.byCategory,
      queue: result.catalogingQueue.map((item) => item.id),
      total: result.specimens.total,
      recent: result.recentSpecimens.length,
      duplicates: result.specimens.possibleDuplicates,
    }).toEqual({
      categories: [{ category: 'Active', count: 2 }],
      queue: [draft],
      total: 5,
      recent: 5,
      duplicates: 2,
    });
  });

  it('consolidated active breakdowns exclude archived quantities but keep all-record history totals', async () => {
    const dto = Object.assign(new GenerateReportDto(), {
      type: ReportType.CONSOLIDATED_OPERATIONS,
      format: ReportFormat.CSV,
      period: ReportPeriodType.ALL_TIME,
    });
    const result = await new ReportBuilderService(prisma).build({
      dto,
      period: resolveReportPeriod(dto),
      generatedAt: new Date('2026-11-04T00:00:00Z'),
      generatedBy: 'Synthetic curator',
    });
    const values = Object.fromEntries(
      result.blocks.flatMap((block) =>
        block.kind === 'keyValues'
          ? block.items.map((item) => [item.label, item.value])
          : [],
      ),
    );
    expect(values).toMatchObject({
      'Total specimen records': 5,
      'Active lots': 2,
      'Total specimens in active lots': 7,
    });
    expect(
      result.blocks.find(
        (block) =>
          block.kind === 'table' &&
          block.table.title === 'Specimens by category',
      ),
    ).toMatchObject({ table: { rows: [['Active', 2]] } });
  });

  it('keeps explicit stored-status archive searches and direct legacy details readable', async () => {
    const archived = await catalog.search(
      Object.assign(new SearchSpecimensQueryDto(), {
        status: SpecimenStatus.ARCHIVED,
        search: 'Read fixture',
      }),
    );
    expect(archived.items.map((item) => item.id).sort()).toEqual([
      '50000000-0000-4000-8000-000000000003',
      '50000000-0000-4000-8000-000000000005',
    ]);
    const legacy = await catalog.findOne(
      '50000000-0000-4000-8000-000000000004',
    );
    expect({ status: legacy.status, archivedAt: legacy.archivedAt }).toEqual({
      status: SpecimenStatus.UNCATALOGED,
      archivedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const active = await catalog.search(
      Object.assign(new SearchSpecimensQueryDto(), {
        status: SpecimenStatus.UNCATALOGED,
      }),
    );
    expect({
      ids: active.items.map((item) => item.id),
      total: active.total,
    }).toEqual({ ids: [draft], total: 1 });
  });
});
