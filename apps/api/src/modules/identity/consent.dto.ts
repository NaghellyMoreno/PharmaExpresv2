import type { components } from '@pharma/api-contract';
import { IsIn, IsString, MaxLength } from 'class-validator';

type Declarant = components['schemas']['Declarant'];

export class ConsentAcceptanceDto {
  @IsString()
  @MaxLength(32)
  noticeVersion!: string;

  @IsIn(['holder', 'third_party'] satisfies Declarant[])
  declarant!: Declarant;
}
