// src/specimens/specimens.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import { ImportSpecimenRowDto } from './dto/import-specimen-row.dto';
import { Specimen, SpecimenStatus } from './entities/specimen.entity';

// REQ-4.4-06/07: fields that must all be valid/present for a record to
// become Cataloged. Adjust once the curator-approved field list (§4.4.4)
// is finalized — this is the confirmed subset from the SRS.
const REQUIRED_FOR_CATALOGED: (keyof CreateSpecimenDto)[] = [
  'scientificName',
  'commonName',
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
];

export interface ImportRowResult {
  rowNumber?: number;
  status: 'created' | 'possible_duplicate' | 'error';
  specimen?: Specimen;
  errors?: string[];
}

// In-memory placeholder store. Replace with PrismaService once the
// database is provisioned — see docs/backend-architecture.md §3.
@Injectable()
export class SpecimensService {
  private readonly specimens: Specimen[] = [];

  create(dto: CreateSpecimenDto, actingCuratorId: string): Specimen {
    const missingFields = this.getMissingFields(dto);
    const specimen: Specimen = {
      id: randomUUID(),
      status: missingFields.length ? SpecimenStatus.UNCATALOGED : SpecimenStatus.CATALOGED,
      publicDisplay: false,
      missingFields,
      createdBy: actingCuratorId,
      updatedBy: actingCuratorId,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      accessionNumber: dto.accessionNumber ?? null,
      ...dto,
    };
    this.specimens.push(specimen);
    return specimen;
  }

  findAll(): Specimen[] {
    return this.specimens.filter((s) => s.status !== SpecimenStatus.ARCHIVED);
  }

  findOne(id: string): Specimen {
    const specimen = this.specimens.find((s) => s.id === id);
    if (!specimen) throw new NotFoundException(`Specimen ${id} not found`);
    return specimen;
  }

  update(id: string, dto: UpdateSpecimenDto, actingCuratorId: string): Specimen {
    const specimen = this.findOne(id);
    Object.assign(specimen, dto);
    specimen.updatedBy = actingCuratorId;
    specimen.updatedAt = new Date();

    // REQ-4.4-06/07: re-derive status after every edit
    specimen.missingFields = this.getMissingFields(specimen);
    if (specimen.status !== SpecimenStatus.ARCHIVED) {
      specimen.status = specimen.missingFields.length
        ? SpecimenStatus.UNCATALOGED
        : SpecimenStatus.CATALOGED;
    }
    return specimen;
  }

  // REQ-4.4-10: archive instead of delete
  archive(id: string, actingCuratorId: string): Specimen {
    const specimen = this.findOne(id);
    specimen.status = SpecimenStatus.ARCHIVED;
    specimen.archivedBy = actingCuratorId;
    specimen.archivedAt = new Date();
    specimen.publicDisplay = false; // REQ-4.4-11: archived records can't stay public-eligible
    return specimen;
  }

  // REQ-4.4-15/16: toggle public-display eligibility, only for Cataloged records
  setPublicDisplay(id: string, publicDisplay: boolean): Specimen {
    const specimen = this.findOne(id);
    if (specimen.status !== SpecimenStatus.CATALOGED) {
      throw new NotFoundException(
        `Specimen ${id} must be Cataloged before it can be marked for public display`,
      );
    }
    specimen.publicDisplay = publicDisplay;
    return specimen;
  }

  // REQ-4.4-21: warn on possible duplicates — simple heuristic for now
  // (same scientific name + same collector). Refine once curator feedback
  // on false-positive rate comes in.
  findPossibleDuplicates(dto: CreateSpecimenDto): Specimen[] {
    if (!dto.scientificName) return [];
    return this.specimens.filter(
      (s) =>
        s.status !== SpecimenStatus.ARCHIVED &&
        s.scientificName?.toLowerCase() === dto.scientificName?.toLowerCase() &&
        s.collector === dto.collector,
    );
  }

  // REQ-4.4-19/20/22: import rows one at a time; never auto-merge duplicates
  importRows(rows: ImportSpecimenRowDto[], actingCuratorId: string): ImportRowResult[] {
    return rows.map((row) => {
      const duplicates = this.findPossibleDuplicates(row);
      const specimen = this.create(row, actingCuratorId);
      return {
        rowNumber: row.rowNumber,
        status: duplicates.length ? 'possible_duplicate' : 'created',
        specimen,
      };
    });
  }

  private getMissingFields(dto: Partial<CreateSpecimenDto>): string[] {
    return REQUIRED_FOR_CATALOGED.filter((field) => !dto[field]);
  }
}