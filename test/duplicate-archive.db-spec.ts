/** Public duplicate service against owned PostgreSQL; no shared data/auth or AppModule. */
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpecimenDuplicatesService } from '../src/specimens/specimen-duplicates.service';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { seedFaqReviewAuthTables } from './support/faq-review-database-app';

describe('Duplicate archive scope on owned PostgreSQL (OBS-006)', () => {
  let database: DisposableFaqPostgres;
  let prisma: PrismaService;
  let service: SpecimenDuplicatesService;
  const activeDraft = '40000000-0000-4000-8000-000000000001';
  const activeCataloged = '40000000-0000-4000-8000-000000000002';
  const candidate = {
    scientificName: 'Synthetic duplicate species',
    commonName: 'Synthetic archive test',
  };

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('duplicate-archive');
    await database.createRole('service_role');
    await seedFaqReviewAuthTables(database.admin);
    for (const file of [
      '003_collection.sql',
      '005_specimen.sql',
      '007_specimenprovenance.sql',
    ]) {
      await database.admin.query(
        readFileSync(resolve(__dirname, '../database/sql', file), 'utf8'),
      );
    }
    await database.admin.query(`
      INSERT INTO specimen (id, created_by, scientific_name, common_name, status, archived_at) VALUES
        ('${activeDraft}', '11111111-1111-4111-8111-111111111111', 'Synthetic duplicate species', 'Synthetic archive test', 'UNCATALOGED', NULL),
        ('${activeCataloged}', '11111111-1111-4111-8111-111111111111', 'Synthetic duplicate species', 'Synthetic archive test', 'CATALOGED', NULL),
        ('40000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Synthetic duplicate species', 'Synthetic archive test', 'ARCHIVED', NULL),
        ('40000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Synthetic duplicate species', 'Synthetic archive test', 'UNCATALOGED', '2026-01-01T00:00:00Z'),
        ('40000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Synthetic duplicate species', 'Synthetic archive test', 'ARCHIVED', '2026-01-01T00:00:00Z');
      GRANT SELECT ON specimen, specimen_provenance TO service_role;
    `);
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: database.url('service_role') }),
    );
    await prisma.$connect();
    service = new SpecimenDuplicatesService(prisma);
  });

  afterAll(async () => {
    try {
      await prisma?.$disconnect();
    } finally {
      await database?.close();
    }
  });

  it('returns active drafts and cataloged matches but excludes either archive indicator', async () => {
    const matches = await service.findForCandidate(candidate);
    expect(matches.map((match) => match.specimenId).sort()).toEqual([
      activeDraft,
      activeCataloged,
    ]);
  });
});
