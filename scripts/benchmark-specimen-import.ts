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
// Safety: this deliberately does NOT read the app's normal DATABASE_URL —
// even if a developer's .env already has one configured for running the
// app locally, this script must never silently point at it. It requires
// its own BENCHMARK_DATABASE_URL plus an explicit
// RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK=true opt-in, and refuses to open any
// database connection unless both are present. Point BENCHMARK_DATABASE_URL
// at a disposable database, never a shared one — this script creates and
// deletes real rows (a fixture curator, a stub `auth.users` row, and
// ROW_COUNT specimens). Cleanup does not rely on tracking which rows were
// created during a successful run: it deletes by fixtureCuratorAccountId,
// so a partial failure anywhere (setup, preview, commit, or an assertion)
// still leaves the database as it found it.
//
// Usage (bash):
//   RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK=true \
//   BENCHMARK_DATABASE_URL=postgresql://user:pass@localhost:5432/some_throwaway_db \
//     npm run benchmark:specimen-import
//
// Usage (PowerShell):
//   $env:RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK = "true"
//   $env:BENCHMARK_DATABASE_URL = "postgresql://user:pass@localhost:5432/some_throwaway_db"
//   npm run benchmark:specimen-import
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

function assertOptedIn(): string {
  if (process.env.RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK !== 'true') {
    throw new Error(
      'RUN_LIVE_SPECIMEN_IMPORT_BENCHMARK=true is required to run this ' +
        'benchmark. This is a deliberate double opt-in (alongside ' +
        'BENCHMARK_DATABASE_URL) since it creates and deletes real rows.',
    );
  }

  const connectionString = process.env.BENCHMARK_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'BENCHMARK_DATABASE_URL is required and must point at a disposable ' +
        "database. This script deliberately ignores the app's normal " +
        'DATABASE_URL so it can never silently run against whatever ' +
        "database a developer's .env happens to be configured for.",
    );
  }

  return connectionString;
}

/**
 * Deletes every row this run could plausibly have created, keyed only by
 * fixtureCuratorAccountId/fixtureAuthUserId — never by a list of specimen
 * ids collected during a successful run, since that list may not exist if
 * setup, preview, commit, or an assertion threw first. Safe to call with
 * either id undefined (nothing to clean up yet) and safe to call more than
 * once. Cleanup failures are logged, not swallowed, and never thrown from
 * here — the caller decides how to prioritize them against a benchmark
 * error that may already be in flight.
 */
async function cleanupFixture(
  rawPrisma: PrismaClient,
  fixtureCuratorAccountId: string | undefined,
  fixtureAuthUserId: string | undefined,
): Promise<unknown> {
  try {
    if (fixtureCuratorAccountId) {
      await rawPrisma.specimen.deleteMany({
        where: { created_by: fixtureCuratorAccountId },
      });
      await rawPrisma.audit_log.deleteMany({
        where: { user_id: fixtureCuratorAccountId },
      });
      await rawPrisma.user_account
        .delete({ where: { id: fixtureCuratorAccountId } })
        .catch(() => undefined);
    }
    if (fixtureAuthUserId) {
      await rawPrisma.$executeRaw`DELETE FROM auth.users WHERE id = ${fixtureAuthUserId}::uuid`;
    }
    return undefined;
  } catch (cleanupError) {
    return cleanupError;
  }
}

async function main(): Promise<void> {
  const connectionString = assertOptedIn();

  let rawPrisma: PrismaClient | undefined;
  let prisma: PrismaService | undefined;
  let fixtureAuthUserId: string | undefined;
  let fixtureCuratorAccountId: string | undefined;
  let benchmarkError: unknown;
  let cleanupError: unknown;

  try {
    rawPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
    await rawPrisma.$connect();

    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: connectionString }),
    );
    await prisma.onModuleInit();

    const specimensService = new SpecimensService(prisma);
    const importService = new SpecimenImportService(prisma, specimensService);

    fixtureAuthUserId = randomUUID();
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

    if (
      commitResult.createdCount !== ROW_COUNT ||
      commitResult.failedCount !== 0
    ) {
      throw new Error(
        `Expected ${ROW_COUNT} created / 0 failed, got ${commitResult.createdCount} created / ${commitResult.failedCount} failed.`,
      );
    }

    const savedCount = await rawPrisma.specimen.count({
      where: { created_by: fixtureCuratorAccountId },
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
  } catch (error) {
    benchmarkError = error;
  } finally {
    if (rawPrisma) {
      cleanupError = await cleanupFixture(
        rawPrisma,
        fixtureCuratorAccountId,
        fixtureAuthUserId,
      );
      if (cleanupError) {
        console.error(
          'Benchmark fixture cleanup failed (rows may remain in ' +
            `${connectionString.replace(/:[^:@/]*@/, ':***@')}):`,
        );
        console.error(cleanupError);
        if (benchmarkError) {
          console.error(
            'The original benchmark error (preserved below) is the ' +
              'primary failure; the cleanup error above is secondary.',
          );
        }
      }
    }
    if (prisma) {
      await prisma.onModuleDestroy().catch((error: unknown) => {
        console.error(
          'Failed to disconnect the Nest-managed Prisma client:',
          error,
        );
      });
    }
    if (rawPrisma) {
      await rawPrisma.$disconnect().catch((error: unknown) => {
        console.error('Failed to disconnect the raw Prisma client:', error);
      });
    }
  }

  // A cleanup-only failure (the benchmark itself succeeded) still must exit
  // non-zero: rows may have been left behind in the database. When both
  // fail, the benchmark error is the one preserved and rethrown above —
  // this is only reached when benchmarkError is falsy.
  if (benchmarkError) {
    throw benchmarkError instanceof Error
      ? benchmarkError
      : new Error('Non-Error value thrown during benchmark (see cause)', {
          cause: benchmarkError,
        });
  }
  if (cleanupError) {
    throw new Error(
      'Specimen import benchmark succeeded, but fixture cleanup failed ' +
        'afterward — the database may still contain benchmark rows. See ' +
        'the cleanup error logged above.',
      { cause: cleanupError },
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
