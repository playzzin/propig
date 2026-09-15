import { z } from 'zod';
import { isPersistableBrandAssetUrl } from '@/constants/brandAssets';

export const envLogoUrlSchema = z
  .string()
  .trim()
  .refine(
    (value) => value.length === 0 || isPersistableBrandAssetUrl(value),
    '저장 가능한 http(s) 이미지 URL을 입력해 주세요.',
  );

export const systemSettingsFormSchema = z.object({
  logoUrl: envLogoUrlSchema,
  envLogos: z.record(z.string(), envLogoUrlSchema),
});

export type SystemSettingsFormValues = z.infer<typeof systemSettingsFormSchema>;
