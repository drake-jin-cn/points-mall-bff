import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class MenuItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  icon?: string | null;

  @IsOptional()
  @IsInt()
  parent_id?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  permission_key?: string | null;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
