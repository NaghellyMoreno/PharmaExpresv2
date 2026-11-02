import { IsString, IsUUID, Matches } from 'class-validator';

/** `CedulaInput` de api/openapi.yaml. */
export class CedulaDto {
  @IsString()
  @Matches(/^[0-9]{5,12}$/)
  cedula!: string;
}

/** `OtpVerificationInput` de api/openapi.yaml. */
export class OtpVerificationDto {
  @IsUUID()
  challengeId!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/)
  code!: string;
}
