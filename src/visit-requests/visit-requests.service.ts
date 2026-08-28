import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { UpdateVisitRequestDto } from './dto/update-visit-request.dto';
import {
  VisitRequest,
  VisitRequestStatus,
} from './entities/visit-request.entity';

// In-memory placeholder store. Replace with PrismaService once the
// database is provisioned — see docs/backend-architecture.md §3.
@Injectable()
export class VisitRequestsService {
  private readonly visitRequests: VisitRequest[] = [];

  create(createVisitRequestDto: CreateVisitRequestDto): VisitRequest {
    const visitRequest: VisitRequest = {
      id: randomUUID(),
      status: VisitRequestStatus.PENDING,
      createdAt: new Date(),
      ...createVisitRequestDto,
    };
    this.visitRequests.push(visitRequest);
    return visitRequest;
  }

  findAll(): VisitRequest[] {
    return this.visitRequests;
  }

  findOne(id: string): VisitRequest {
    const visitRequest = this.visitRequests.find((item) => item.id === id);
    if (!visitRequest) {
      throw new NotFoundException(`Visit request ${id} not found`);
    }
    return visitRequest;
  }

  update(
    id: string,
    updateVisitRequestDto: UpdateVisitRequestDto,
  ): VisitRequest {
    const visitRequest = this.findOne(id);
    Object.assign(visitRequest, updateVisitRequestDto);
    return visitRequest;
  }

  remove(id: string): void {
    const index = this.visitRequests.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundException(`Visit request ${id} not found`);
    }
    this.visitRequests.splice(index, 1);
  }
}
