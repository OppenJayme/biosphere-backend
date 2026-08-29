import { Test, TestingModule } from '@nestjs/testing';
import { VisitRequestsController } from './visit-requests.controller';
import { VisitRequestsService } from './visit-requests.service';

describe('VisitRequestsController', () => {
  let controller: VisitRequestsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisitRequestsController],
      providers: [VisitRequestsService],
    }).compile();

    controller = module.get<VisitRequestsController>(VisitRequestsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
