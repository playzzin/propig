import { z } from 'zod';

export const menuToolboxFormSchema = z.object({
  selectedPagePath: z.string().trim().min(1, '등록할 페이지를 선택해 주세요.'),
  customLabel: z.string().trim().max(50, '메뉴명은 50자 이하로 입력해 주세요.'),
});

export type MenuToolboxFormValues = z.infer<typeof menuToolboxFormSchema>;
