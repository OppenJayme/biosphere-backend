/**
 * Which personal-data columns (marked `personal` in export-sheets.ts) the
 * weekly Excel export may include (spec 0003, AC-2a). Changing this list is
 * a reviewed code change, never a runtime toggle.
 *
 * PROVISIONAL: on 2026-11-12 the team assumed all visitor columns, so the
 * Library could review a complete export at the re-presentation. This
 * follows the Library's 2026-11-11 answer that visitor data is backed up
 * together with inventory data. It is NOT yet a recorded field-by-field
 * approval: update `status`, `approvedBy`, `role`, `date` and the column
 * list once the Library or privacy owner confirms (spec open question 6).
 */
export interface ExportFieldSet {
  version: string;
  status: 'PROVISIONAL' | 'APPROVED';
  approvedBy: string | null;
  role: string | null;
  date: string;
  note: string;
  /** "<Sheet>.<Column label>" for each personal column allowed. */
  personalColumns: readonly string[];
}

export const EXPORT_FIELD_SET: ExportFieldSet = {
  version: 'provisional-2026-11-12',
  status: 'PROVISIONAL',
  approvedBy: null,
  role: null,
  date: '2026-11-12',
  note: 'Assumed for the 2026-11-12 re-presentation: all visitor columns, pending confirmation by the Library or privacy owner.',
  personalColumns: [
    'Inquiries.Full name',
    'Inquiries.Email',
    'Inquiries.Contact number',
    'Inquiries.Organization',
    'Inquiries.Message',
    'Visit requests.Contact person',
    'Visit requests.Email',
    'Visit requests.Contact number',
    'Visit requests.Organization',
    'Visit requests.Address',
    'Visit requests.Purpose',
    'Visit requests.Miscellaneous details',
    'Visit requests.Additional notes',
    'Visitors.Name',
    'Vehicles.Plate number',
    'Vehicles.Brand',
    'Vehicles.Driver name',
    'Correspondence.Recipient email',
    'Correspondence.Subject',
    'Correspondence.Message',
  ],
};
