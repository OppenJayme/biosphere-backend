import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateInquiryDto } from './dto/create-inquiry.dto';
import { UpdateInquiryDto } from './dto/update-inquiry.dto';
import { Inquiry, InquiryStatus } from './entities/inquiry.entity';

// In-memory placeholder store. Replace with PrismaService once the
// database is provisioned — see docs/backend-architecture.md §3.
@Injectable()
export class InquiriesService {
  private readonly inquiries: Inquiry[] = [];

  create(createInquiryDto: CreateInquiryDto): Inquiry {
    const inquiry: Inquiry = {
      id: randomUUID(),
      status: InquiryStatus.PENDING,
      createdAt: new Date(),
      ...createInquiryDto,
    };
    this.inquiries.push(inquiry);
    return inquiry;
  }

  findAll(): Inquiry[] {
    return this.inquiries;
  }

  findOne(id: string): Inquiry {
    const inquiry = this.inquiries.find((item) => item.id === id);
    if (!inquiry) {
      throw new NotFoundException(`Inquiry ${id} not found`);
    }
    return inquiry;
  }

  update(id: string, updateInquiryDto: UpdateInquiryDto): Inquiry {
    const inquiry = this.findOne(id);
    Object.assign(inquiry, updateInquiryDto);
    return inquiry;
  }

  remove(id: string): void {
    const index = this.inquiries.findIndex((item) => item.id === id);
    if (index === -1) {
      throw new NotFoundException(`Inquiry ${id} not found`);
    }
    this.inquiries.splice(index, 1);
  }
}
