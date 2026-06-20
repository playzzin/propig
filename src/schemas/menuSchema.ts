import { z } from 'zod';

export const MenuItemSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    id: z.string().min(1, 'ID는 필수입니다'),
    text: z.string().min(1, '텍스트는 필수입니다'),
    path: z.string().optional(),
    icon: z.string().optional(),
    roles: z.array(z.string()).optional(),
    permissions: z.array(z.string()).optional(),
    type: z.enum(['folder', 'link', 'divider']).optional(),
    sub: z.array(z.union([z.string(), MenuItemSchema])).optional(),
    expanded: z.boolean().optional(),
    position: z.array(z.string()).optional(),
    badge: z.union([z.string(), z.number()]).optional(),
    external: z.boolean().optional(),
    hidden: z.boolean().optional(),
    propigAppId: z.string().optional(),
  })
);

export const SiteDataSchema = z.object({
  name: z.string().min(1, '사이트 이름은 필수입니다'),
  icon: z.string().min(1, '사이트 아이콘은 필수입니다'),
  menu: z.array(MenuItemSchema),
  trash: z.array(MenuItemSchema),
});

export const SiteDataTypeSchema = z.record(z.string(), SiteDataSchema);

export function validateMenuItem(item: unknown): boolean {
  try {
    MenuItemSchema.parse(item);
    return true;
  } catch {
    return false;
  }
}

export function validateSiteData(data: unknown): boolean {
  try {
    SiteDataSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}

export function validateAllSites(data: unknown): boolean {
  try {
    SiteDataTypeSchema.parse(data);
    return true;
  } catch {
    return false;
  }
}
