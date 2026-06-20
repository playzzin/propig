import { z } from 'zod';

export const authEmailSchema = z
  .string()
  .trim()
  .min(1, '이메일을 입력해 주세요.')
  .email('이메일 형식이 올바르지 않습니다.');

export const authPasswordSchema = z
  .string()
  .min(6, '비밀번호는 최소 6자 이상이어야 합니다.');

export const authFormSchema = z.object({
  email: authEmailSchema,
  password: authPasswordSchema,
});

export type AuthFormValues = z.infer<typeof authFormSchema>;
