import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { SpecimenAccessionService } from '../src/specimens/specimen-accession.service';
import { SpecimenCatalogingService } from '../src/specimens/specimen-cataloging.service';
import { SpecimensService } from '../src/specimens/specimens.service';

dotenv.config();

// -----------------------------------------------------------------------
// Live PostgreSQL regression check for accession-number uniqueness
// (REQ-4.4-04, BR-01). The mocked unit specs can only check the SQL's
// shape; this runs the service's real queries against the real
// `uq_specimen_accession_number` index to prove the application pre-check
// and the index agree, including on a legacy stored value with surrounding
// spaces.
//
// It is a script, not a test/*.e2e-spec.ts file, for the same reason as
// scripts/benchmark-specimen-import.ts: Jest's --experimental-vm-modules
// mode (needed by the Prisma client) cannot load @nestjs/config.
//
// Safety: requires RUN_LIVE_ACCESSION_VERIFY=true plus its own
// ACCESSION_VERIFY_DATABASE_URL (never the app's DATABASE_URL). All work
// happens in one transaction that is always rolled back, so no rows are
// left behind. The database must already have the accession migration.
//
//   RUN_LIVE_ACCESSION_VERIFY=true \
//   ACCESSION_VERIFY_DATABASE_URL=postgresql://user:pass@localhost:5432/throwaway \
//   npm run verify:accession-uniqueness
// -----------------------------------------------------------------------

class Rollback extends Error {}

function assertOptedIn(): string {
  if (process.env.RUN_LIVE_ACCESSION_VERIFY !== 'true') {
    throw new Error(
      'RUN_LIVE_ACCESSION_VERIFY=true is required (a deliberate double opt-in ' +
        'alongside ACCESSION_VERIFY_DATABASE_URL).',
    );
  }
  const connectionString = process.env.ACCESSION_VERIFY_DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'ACCESSION_VERIFY_DATABASE_URL is required. This script deliberately ' +
        "ignores the app's DATABASE_URL.",
    );
  }
  return connectionString;
}

async function verify(transaction: Prisma.TransactionClient): Promise<void> {
  const [{ exists }] = await transaction.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_indexes WHERE indexname = 'uq_specimen_accession_number'
    ) AS exists`;
  assert.equal(exists, true, 'the accession migration must be applied first');

  const authUserId = randomUUID();
  await transaction.$executeRaw`
    INSERT INTO auth.users (id) VALUES (${authUserId}::uuid)`;
  const curator = await transaction.user_account.create({
    data: {
      auth_user_id: authUserId,
      full_name: 'Accession Verify',
      role: 'CURATOR',
      status: 'ACTIVE',
    },
  });

  const number = `VERIFY-${randomUUID().slice(0, 8)}`;
  const legacy = await transaction.specimen.create({
    data: {
      created_by: curator.id,
      accession_number: `  ${number.toLowerCase()} `,
      status: 'ARCHIVED',
    },
  });

  const client = transaction as unknown as PrismaService;
  const accession = new SpecimenAccessionService(client);
  const specimens = new SpecimensService(
    client,
    new SpecimenCatalogingService(client),
    accession,
  );

  const taken = await accession.checkAvailability(number);
  assert.equal(taken.available, false, 'padded legacy value must block');
  assert.equal(taken.conflictingSpecimen?.id, legacy.id);
  assert.equal(taken.conflictingSpecimen?.status, 'ARCHIVED');
  console.log('ok  availability: legacy "  x " blocks "X" (Archived included)');

  const own = await accession.checkAvailability(number, legacy.id);
  assert.equal(own.available, true, 'the edited record is excluded');
  console.log('ok  availability: the edited record keeps its own number');

  const tab = await accession.checkAvailability(`${number}\t`);
  assert.equal(tab.available, true, 'btrim strips spaces only');
  console.log('ok  availability: a tab-suffixed value is a different key');

  const holders = await accession.findHolders([number, 'NOT-TAKEN-0']);
  assert.deepEqual([...holders.keys()], [number]);
  assert.equal(holders.get(number)?.id, legacy.id);
  console.log('ok  import lookup: finds the padded holder by input value');

  await assert.rejects(
    specimens.createUncatalogedRecordFor(
      transaction,
      { accessionNumber: number },
      curator.id,
      'CREATE_SPECIMEN',
    ),
    (error: unknown) => error instanceof ConflictException,
  );
  console.log('ok  write path: create is rejected with 409 by the pre-check');

  // Last: a constraint violation aborts the transaction.
  const indexError = await transaction.specimen
    .create({ data: { created_by: curator.id, accession_number: number } })
    .then(
      () => null,
      (error: unknown) => error,
    );
  assert.equal(accession.isUniqueViolation(indexError), true);
  console.log('ok  index: agrees with the pre-check (P2002)');
}

async function main(): Promise<void> {
  const connectionString = assertOptedIn();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    await prisma
      .$transaction(async (transaction) => {
        await verify(transaction);
        throw new Rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error;
      });
    console.log(
      'accession-number uniqueness verified; all changes rolled back',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
