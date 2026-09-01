// Auth Tester
import { Module } from '@nestjs/common';
import { TestController } from './dev-sandbox.controller';

@Module({
  controllers: [TestController],
})
export class TestModule {}
