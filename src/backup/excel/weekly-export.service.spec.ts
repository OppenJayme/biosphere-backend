import { ConfigService } from '@nestjs/config';
import { readSheet } from 'read-excel-file/node';
import type { ExportFieldSet } from './export-field-set';
import type { ExportRelation, ExportSheet } from './export-sheets';
import {
  ExportFailure,
  latestSlotDate,
  manilaToday,
  parseSchedule,
  WeeklyExportService,
} from './weekly-export.service';

const SAT_18 = parseSchedule('SAT 18:00');

describe('weekly export schedule', () => {
  it('parses the schedule and falls back on bad input', () => {
    expect(parseSchedule('sat 18:00')).toEqual({ day: 6, hour: 18, minute: 0 });
    expect(parseSchedule('FRI 7:30')).toEqual({ day: 5, hour: 7, minute: 30 });
    expect(parseSchedule('XYZ 25:00')).toEqual(SAT_18);
    expect(parseSchedule(undefined)).toEqual(SAT_18);
  });

  it('finds the latest Saturday 18:00 Manila slot', () => {
    // 2026-11-14 is a Saturday. 18:00 Manila = 10:00 UTC.
    expect(latestSlotDate(new Date('2026-11-14T09:59:00Z'), SAT_18)).toBe(
      '2026-11-07',
    );
    expect(latestSlotDate(new Date('2026-11-14T10:00:00Z'), SAT_18)).toBe(
      '2026-11-14',
    );
    expect(latestSlotDate(new Date('2026-11-17T03:00:00Z'), SAT_18)).toBe(
      '2026-11-14',
    );
    // Saturday 23:00 Manila is still that Saturday, not Sunday in UTC terms.
    expect(latestSlotDate(new Date('2026-11-14T15:00:00Z'), SAT_18)).toBe(
      '2026-11-14',
    );
  });

  it('reports the Manila date, not the UTC date', () => {
    expect(manilaToday(new Date('2026-11-11T17:00:00Z'))).toBe('2026-11-12');
  });
});

type R = { id: string; parent?: string | null; name?: string; secret?: string };

function fixture(overrides: Partial<Record<string, R[]>> = {}): ExportSheet[] {
  const parents = overrides.parents ?? [{ id: 'p1' }, { id: 'p2' }];
  const children = overrides.children ?? [
    { id: 'c1', parent: 'p1', secret: 'visitor@example.test' },
    { id: 'c2', parent: null, secret: '=cmd' },
  ];
  return [
    {
      name: 'Visit requests',
      sourceCount: parents.length,
      rows: parents,
      columns: [{ label: 'ID', value: (r: R) => r.id }],
    },
    {
      name: 'Visitors',
      sourceCount: children.length,
      rows: children,
      columns: [
        { label: 'ID', value: (r: R) => r.id },
        { label: 'Visit request ID', value: (r: R) => r.parent ?? null },
        { label: 'Name', personal: true, value: (r: R) => r.secret ?? null },
      ],
    },
  ] as ExportSheet[];
}

const RELATIONS: ExportRelation[] = [
  {
    sheet: 'Visitors',
    column: 'Visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
];

const fieldSet = (personalColumns: string[]): ExportFieldSet => ({
  version: 'test',
  status: 'PROVISIONAL',
  approvedBy: null,
  role: null,
  date: '2026-11-12',
  note: 'test',
  personalColumns,
});

describe('weekly export workbook checks', () => {
  const service = new WeeklyExportService(
    {} as never,
    new ConfigService({}),
    {} as never,
    {} as never,
  );
  const at = new Date('2026-11-14T10:00:00Z');

  it('leaves out personal columns that are not approved', async () => {
    const sheets = fixture();
    const built = service.buildWorkbook(sheets, '2026-11-14', at, fieldSet([]));
    expect(built.headers.Visitors).toEqual(['ID', 'Visit request ID']);
    const rows = await readSheet(built.workbook, 'Visitors');
    expect(JSON.stringify(rows)).not.toContain('visitor@example.test');
    const about = await readSheet(built.workbook, 'About');
    expect(about).toContainEqual(['Personal-data columns included', 'None']);
    await expect(
      service.verifyWorkbook(
        built.workbook,
        sheets,
        built.rowCounts,
        built.expectedTruncated,
        fieldSet([]),
        RELATIONS,
      ),
    ).resolves.toBeUndefined();
  });

  it('includes approved personal columns and records them on the About sheet', async () => {
    const sheets = fixture();
    const fs = fieldSet(['Visitors.Name']);
    const built = service.buildWorkbook(sheets, '2026-11-14', at, fs);
    expect(built.headers.Visitors).toEqual(['ID', 'Visit request ID', 'Name']);
    expect(built.rowCounts).toEqual({ 'Visit requests': 2, Visitors: 2 });
    const about = await readSheet(built.workbook, 'About');
    expect(about).toContainEqual([
      'Personal-data columns included',
      'Visitors.Name',
    ]);
    expect(about).toContainEqual(['Rows: Visitors', 2]);
    await service.verifyWorkbook(
      built.workbook,
      sheets,
      built.rowCounts,
      built.expectedTruncated,
      fs,
      RELATIONS,
    );
    expect((await readSheet(built.workbook, 'Visitors'))[2][2]).toBe('=cmd');
  });

  it('fails with COUNT_MISMATCH when rows differ from the source count', () => {
    const sheets = fixture();
    sheets[1].sourceCount = 3;
    expect(() =>
      service.buildWorkbook(sheets, '2026-11-14', at, fieldSet([])),
    ).toThrow(new ExportFailure('COUNT_MISMATCH'));
  });

  it('fails with RELATION_MISMATCH for a reference to a missing parent', async () => {
    const sheets = fixture({ children: [{ id: 'c1', parent: 'missing' }] });
    const built = service.buildWorkbook(sheets, '2026-11-14', at, fieldSet([]));
    await expect(
      service.verifyWorkbook(
        built.workbook,
        sheets,
        built.rowCounts,
        built.expectedTruncated,
        fieldSet([]),
        RELATIONS,
      ),
    ).rejects.toEqual(new ExportFailure('RELATION_MISMATCH'));
  });

  it('fails with FIELD_MISMATCH when the file headers differ from the spec', async () => {
    const sheets = fixture();
    const built = service.buildWorkbook(sheets, '2026-11-14', at, fieldSet([]));
    await expect(
      service.verifyWorkbook(
        built.workbook,
        sheets,
        built.rowCounts,
        built.expectedTruncated,
        fieldSet(['Visitors.Name']),
      ),
    ).rejects.toEqual(new ExportFailure('FIELD_MISMATCH'));
  });

  it('records and verifies cells cut at the Excel limit', async () => {
    const sheets = fixture({
      children: [{ id: 'c1', parent: 'p1', secret: 'x'.repeat(40_000) }],
    });
    const fs = fieldSet(['Visitors.Name']);
    const built = service.buildWorkbook(sheets, '2026-11-14', at, fs);
    expect(built.expectedTruncated).toEqual({
      'Visit requests': 0,
      Visitors: 1,
    });
    await service.verifyWorkbook(
      built.workbook,
      sheets,
      built.rowCounts,
      built.expectedTruncated,
      fs,
      RELATIONS,
    );
    await expect(
      service.verifyWorkbook(
        built.workbook,
        sheets,
        built.rowCounts,
        { 'Visit requests': 0, Visitors: 0 },
        fs,
        RELATIONS,
      ),
    ).rejects.toEqual(new ExportFailure('READBACK_FAILED'));
  });
});
