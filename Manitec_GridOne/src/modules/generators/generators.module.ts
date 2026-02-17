import { Module } from '@nestjs/common';
import { GeneratorsService } from './generators.service';
import { GeneratorsController } from './generators.controller';

@Module({
  controllers: [GeneratorsController],
  providers: [GeneratorsService],
})
export class GeneratorsModule {}
