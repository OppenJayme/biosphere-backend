/** Real allocator/Prisma/PostgreSQL boundary; no AppModule, auth or application .env. */
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpecimenAccessionService } from '../src/specimens/specimen-accession.service';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';

describe('Generated accession allocation on owned PostgreSQL (DEF-042)', () => {
  let database: DisposableFaqPostgres;
  let prisma: PrismaService;
  let service: SpecimenAccessionService;
  const acceptedAt = new Date('2026-06-01T00:00:00Z');

  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('accession-allocation');
    // Minimal read/write surface for this service, plus the real uniqueness SQL.
    // This is not a full specimen-schema, HTTP or authorization fixture.
    await database.admin.query(`CREATE TABLE specimen (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      accession_number varchar(100),
      created_at timestamptz NOT NULL DEFAULT now(),
      status text NOT NULL DEFAULT 'UNCATALOGED',
      archived_at timestamptz
    )`);
    await database.admin.query(
      readFileSync(
        resolve(
          __dirname,
          '../prisma/migrations/20260927000000_enforce_accession_number_uniqueness/migration.sql',
        ),
        'utf8',
      ),
    );
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: database.url() }),
    );
    await prisma.onModuleInit();
    service = new SpecimenAccessionService(prisma);
  });
  afterAll(async () => {
    try {
      await prisma?.onModuleDestroy();
    } finally {
      await database?.close();
    }
  });
  beforeEach(async () => {
    await database.admin.query('TRUNCATE specimen');
  });

  it('returns 0002 after the first allocation is committed with a specimen', async () => {
    const first = await prisma.$transaction(async (transaction) => {
      const number = await service.allocateNext(transaction, acceptedAt);
      await transaction.$executeRaw`INSERT INTO specimen (accession_number) VALUES (${number})`;
      return number;
    });
    expect(first).toBe('USC-BM-2026-0001');
    const second = await prisma.$transaction((transaction) =>
      service.allocateNext(transaction, acceptedAt),
    );
    expect(second).toBe('USC-BM-2026-0002');
  });
});
