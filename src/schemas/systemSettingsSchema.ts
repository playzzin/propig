import { z } from 'zod';

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export const envLogoUrlSchema = z
  .string()
  .trim()
  .refine((value) => value.length === 0 || isHttpUrl(value), 'http(s) URL을 입력해 주세요.');

export const systemSettingsFormSchema = z.object({
  logoUrl: envLogoUrlSchema,
  envLogos: z.record(z.string(), envLogoUrlSchema),
});

export type SystemSettingsFormValues = z.infer<typeof systemSettingsFormSchema>;
