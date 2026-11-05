// Audit keys for a server-rejected offline draft. The notifications feed reads
// these rows to raise SYNC_FAILED alerts (REQ-4.3-05, REQ-4.3-10).
export const OFFLINE_SYNC_AUDIT_MODULE = 'offline-sync';
export const OFFLINE_SYNC_AUDIT_ACTION = 'SYNC_SPECIMEN_DRAFT';
// affected_record_id holds the client draft ID, not a specimen ID.
export const OFFLINE_SYNC_AUDIT_RECORD_TYPE = 'offline_draft';
