import { Test, TestingModule } from '@nestjs/testing';
import { VisitRequestsService } from './visit-requests.service';

describe('VisitRequestsService', () => {
  let service: VisitRequestsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VisitRequestsService],
    }).compile();

    service = module.get<VisitRequestsService>(VisitRequestsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
