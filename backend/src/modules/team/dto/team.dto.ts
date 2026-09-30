import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TeamPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}

export class TeamCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  body!: string;
}

export class TeamMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

export class TeamChannelDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  description?: string;
}
