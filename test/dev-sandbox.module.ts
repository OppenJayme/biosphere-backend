// Auth Tester
<<<<<<< Updated upstream
import { Module } from '@nestjs/common';
import { TestController } from './dev-sandbox.controller';
=======
import { Module } from "@nestjs/common";
import { TestController } from "./dev-sandbox.controller";
>>>>>>> Stashed changes

@Module({
  controllers: [TestController],
})
export class TestModule {}
