import type { Prisma } from '../generated/prisma/client';

/** Legacy rows may have only one marker; either marker makes a record archived. */
export const ARCHIVED_SPECIMEN_WHERE = {
  OR: [{ status: 'ARCHIVED' }, { archived_at: { not: null } }],
} satisfies Prisma.specimenWhereInput;

/** The complement of either archive marker, without changing stored values. */
export const ACTIVE_SPECIMEN_WHERE = {
  status: { not: 'ARCHIVED' },
  archived_at: null,
} satisfies Prisma.specimenWhereInput;
