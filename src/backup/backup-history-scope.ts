/** Reserved rehearsal namespace. Escape '_' because Prisma string filters use SQL LIKE. */
export const SYNTHETIC_BACKUP_TYPE_FILTER = {
  startsWith: 'SYNTHETIC\\_',
  mode: 'insensitive' as const,
};
