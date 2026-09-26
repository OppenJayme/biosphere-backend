import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { SpecimenImportService } from '../src/specimens/specimen-import.service';
import { SpecimensService } from '../src/specimens/specimens.service';

dotenv.config();

// -----------------------------------------------------------------------
// Standalone benchmark (not a Jest test): measures how long a full-size,
// 500-row bulk import actually takes end-to-end against a REAL Postgres
// database, through the real Prisma queries/transactions — the mocked
// unit tests in src/specimens/specimen-import.service.spec.ts check
// correctness, not runtime.
//
// This runs as a plain ts-node script rather than a
// test/*.e2e-spec.ts file because Jest's --experimental-vm-modules mode
// (needed for Prisma's WASM query-compiler dynamic import) currently
// breaks loading @nestjs/config in this repo's toolchain — confirmed by
// running the pre-existing test/developer.e2e-spec.ts live suite, which
// hits the identical "exports is not defined" crash. That's a pre-existing
// Jest/Prisma/@nestjs/config compatibility issue unrelated to this
// benchmark; a plain Node process has no such restriction, since dynamic
// import() from CommonJS needs no special flag outside Jest's sandbox.
//
// Usage:
//   DATABASE_URL=postgresql://user:pass@localhost:5432/some_throwaway_db \
//     npm run benchmark:specimen-import
//
// Point DATABASE_URL at a disposable database, never a shared one — this
// script creates and deletes real rows (a `user_account` fixture curator,
// a stub `auth.users` row, and ROW_COUNT specimens, all removed at the end).
// -----------------------------------------------------------------------

const ROW_COUNT = 500;

function buildCsv(rowCount: number): Express.Multer.File {
  const header = 'scientificName,commonName,specimenCategory\n';
  const rows = Array.from(
    { length: rowCount },
    (_, index) =>
      `Testus benchmarkus ${index},Benchmark specimen ${index},ZOOLOGY\n`,
  ).join('');
  return {
    originalname: 'benchmark.csv',
    buffer: Buffer.from(header + rows, 'utf8'),
  } as Express.Multer.File;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required. Point it at a disposable database — ' +
        'this script creates and deletes real rows.',
    );
  }

  const rawPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
  await rawPrisma.$connect();

  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: connectionString }),
  );
  await prisma.onModuleInit();

  const specimensService = new SpecimensService(prisma);
  const importService = new SpecimenImportService(prisma, specimensService);

  const fixtureAuthUserId = randomUUID();
  let fixtureCuratorAccountId: string | undefined;
  let createdSpecimenIds: string[] = [];

  try {
    await rawPrisma.$executeRaw`INSERT INTO auth.users (id) VALUES (${fixtureAuthUserId}::uuid)`;
    const curator = await rawPrisma.user_account.create({
      data: {
        auth_user_id: fixtureAuthUserId,
        full_name: 'Import Benchmark Curator',
        role: 'CURATOR',
        status: 'ACTIVE',
      },
    });
    fixtureCuratorAccountId = curator.id;

    const file = buildCsv(ROW_COUNT);

    const previewStart = performance.now();
    const preview = await importService.previewImport(
      file,
      fixtureCuratorAccountId,
    );
    const previewMs = performance.now() - previewStart;

    if (preview.validRows !== ROW_COUNT) {
      throw new Error(
        `Expected all ${ROW_COUNT} rows to preview as valid, got ${preview.validRows}.`,
      );
    }

    const commitStart = performance.now();
    const commitResult = await importService.commitImport(
      preview.previewId,
      undefined,
      fixtureCuratorAccountId,
    );
    const commitMs = performance.now() - commitStart;

    createdSpecimenIds = commitResult.results
      .map((result) => result.specimen?.id)
      .filter((id): id is string => !!id);

    if (
      commitResult.createdCount !== ROW_COUNT ||
      commitResult.failedCount !== 0
    ) {
      throw new Error(
        `Expected ${ROW_COUNT} created / 0 failed, got ${commitResult.createdCount} created / ${commitResult.failedCount} failed.`,
      );
    }

    const savedCount = await rawPrisma.specimen.count({
      where: { id: { in: createdSpecimenIds } },
    });
    if (savedCount !== ROW_COUNT) {
      throw new Error(
        `Expected ${ROW_COUNT} rows actually persisted, found ${savedCount}.`,
      );
    }

    console.log('--- specimen bulk import benchmark ---');
    console.log(`rows:            ${ROW_COUNT}`);
    console.log(`preview:         ${previewMs.toFixed(0)}ms`);
    console.log(`commit:          ${commitMs.toFixed(0)}ms`);
    console.log(`avg per row:     ${(commitMs / ROW_COUNT).toFixed(2)}ms`);
    console.log(
      `created / failed: ${commitResult.createdCount} / ${commitResult.failedCount}`,
    );
  } finally {
    if (createdSpecimenIds.length > 0) {
      await rawPrisma.specimen.deleteMany({
        where: { id: { in: createdSpecimenIds } },
      });
    }
    if (fixtureCuratorAccountId) {
      await rawPrisma.audit_log.deleteMany({
        where: { user_id: fixtureCuratorAccountId },
      });
      await rawPrisma.user_account.delete({
        where: { id: fixtureCuratorAccountId },
      });
    }
    await rawPrisma.$executeRaw`DELETE FROM auth.users WHERE id = ${fixtureAuthUserId}::uuid`;
    await prisma.onModuleDestroy();
    await rawPrisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
