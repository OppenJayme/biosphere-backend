import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma } from 'src/generated/prisma/client';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import { ImportSpecimenRowDto } from './dto/import-specimen-row.dto';

export type SpecimenWithRelations = Prisma.specimenGetPayload<{
  include: { specimen_taxonomy: true; specimen_provenance: true };
}>;

export interface ImportRowResult {
  rowNumber?: number;
  status: 'created' | 'possible_duplicate';
  specimen: SpecimenWithRelations;
}

// REQ-4.4-06/07: fields that must all be present for a record to become Cataloged.
const REQUIRED_TAXONOMY_FIELDS = [
  'kingdom', 'phylum', 'class', 'orderName', 'family', 'genus', 'species',
] as const;

@Injectable()
export class SpecimensService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveCuratorId(authUserId: string): Promise<string> {
    const account = await this.prisma.user_account.findUnique({
      where: { auth_user_id: authUserId },
      select: { id: true },
    });
    if (!account) {
      throw new NotFoundException('No curator account found for the authenticated user');
    }
    return account.id;
  }

  private getMissingFields(dto: CreateSpecimenDto): string[] {
    const missing: string[] = [];
    if (!dto.scientificName) missing.push('scientificName');
    for (const field of REQUIRED_TAXONOMY_FIELDS) {
      if (!dto.taxonomy?.[field]) missing.push(field);
    }
    return missing;
  }

  private taxonomyData(taxonomy: CreateSpecimenDto['taxonomy']) {
    if (!taxonomy) return undefined;
    return {
      kingdom: taxonomy.kingdom,
      phylum: taxonomy.phylum,
      class: taxonomy.class,
      order_name: taxonomy.orderName,
      family: taxonomy.family,
      genus: taxonomy.genus,
      species: taxonomy.species,
      habitat: taxonomy.habitat,
      ecological_role: taxonomy.ecologicalRole,
      conservation_status: taxonomy.conservationStatus,
    };
  }

  private provenanceData(provenance: CreateSpecimenDto['provenance']) {
    if (!provenance) return undefined;
    return {
      collector: provenance.collector,
      donor: provenance.donor,
      collection_date: provenance.collectionDate,
      collection_location: provenance.collectionLocation,
      preservation_type: provenance.preservationType,
      preservation_method: provenance.preservationMethod,
    };
  }

  async create(dto: CreateSpecimenDto, authUserId: string): Promise<SpecimenWithRelations> {
    const curatorId = await this.resolveCuratorId(authUserId);
    const missingFields = this.getMissingFields(dto);
    const taxonomyData = this.taxonomyData(dto.taxonomy);
    const provenanceData = this.provenanceData(dto.provenance);

    return this.prisma.specimen.create({
      data: {
        accession_number: dto.accessionNumber ?? null,
        specimen_category: dto.specimenCategory,
        scientific_name: dto.scientificName,
        common_name: dto.commonName,
        remarks: dto.remarks,
        status: missingFields.length ? 'UNCATALOGED' : 'CATALOGED',
        created_by: curatorId,
        specimen_taxonomy: taxonomyData ? { create: taxonomyData } : undefined,
        specimen_provenance: provenanceData ? { create: provenanceData } : undefined,
      },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  findAll() {
    return this.prisma.specimen.findMany({
      where: { status: { not: 'ARCHIVED' } },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  async findOne(id: string): Promise<SpecimenWithRelations> {
    const specimen = await this.prisma.specimen.findUnique({
      where: { id },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
    if (!specimen) throw new NotFoundException(`Specimen ${id} not found`);
    return specimen;
  }

  async update(
    id: string,
    dto: UpdateSpecimenDto,
    authUserId: string,
  ): Promise<SpecimenWithRelations> {
    await this.findOne(id);
    const curatorId = await this.resolveCuratorId(authUserId);
    const missingFields = this.getMissingFields(dto as CreateSpecimenDto);
    const taxonomyData = this.taxonomyData(dto.taxonomy);
    const provenanceData = this.provenanceData(dto.provenance);

    return this.prisma.specimen.update({
      where: { id },
      data: {
        accession_number: dto.accessionNumber,
        specimen_category: dto.specimenCategory,
        scientific_name: dto.scientificName,
        common_name: dto.commonName,
        remarks: dto.remarks,
        status: missingFields.length ? 'UNCATALOGED' : 'CATALOGED',
        updated_by: curatorId,
        specimen_taxonomy: taxonomyData
          ? { upsert: { create: taxonomyData, update: taxonomyData } }
          : undefined,
        specimen_provenance: provenanceData
          ? { upsert: { create: provenanceData, update: provenanceData } }
          : undefined,
      },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  // REQ-4.4-10: archive instead of delete
  async archive(id: string, authUserId: string): Promise<SpecimenWithRelations> {
    await this.findOne(id);
    const curatorId = await this.resolveCuratorId(authUserId);
    return this.prisma.specimen.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archived_by: curatorId,
        archived_at: new Date(),
        public_display_allowed: false, // REQ-4.4-11
      },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  // REQ-4.4-15/16
  async setPublicDisplay(id: string, publicDisplay: boolean): Promise<SpecimenWithRelations> {
    const specimen = await this.findOne(id);
    if (specimen.status !== 'CATALOGED') {
      throw new BadRequestException(
        `Specimen ${id} must be Cataloged before it can be marked for public display`,
      );
    }
    return this.prisma.specimen.update({
      where: { id },
      data: { public_display_allowed: publicDisplay },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  // REQ-4.4-21: heuristic — same scientific name + same collector
  async findPossibleDuplicates(dto: CreateSpecimenDto): Promise<SpecimenWithRelations[]> {
    if (!dto.scientificName) return [];
    return this.prisma.specimen.findMany({
      where: {
        status: { not: 'ARCHIVED' },
        scientific_name: { equals: dto.scientificName, mode: 'insensitive' },
        specimen_provenance: dto.provenance?.collector
          ? { collector: dto.provenance.collector }
          : undefined,
      },
      include: { specimen_taxonomy: true, specimen_provenance: true },
    });
  }

  // REQ-4.4-19/20/22: import rows one at a time, never auto-merge
  async importRows(
    rows: ImportSpecimenRowDto[],
    authUserId: string,
  ): Promise<ImportRowResult[]> {
    const results: ImportRowResult[] = [];
    for (const row of rows) {
      const duplicates = await this.findPossibleDuplicates(row);
      const specimen = await this.create(row, authUserId);
      results.push({
        rowNumber: row.rowNumber,
        status: duplicates.length ? 'possible_duplicate' : 'created',
        specimen,
      });
    }
    return results;
  }
}