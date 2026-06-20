import { z } from 'zod';

export const CorpPageStatusSchema = z.enum(['draft', 'published', 'archived']);

export const CorpPageTemplateKeySchema = z.enum([
  'company-introduction',
  'founding-background',
  'ceo-intro',
  'staff-intro',
  'technology',
  'business-area',
  'social-contribution',
  'generic',
]);

const BaseBlockSchema = z.object({
  id: z.string().min(1),
  enabled: z.boolean().default(true),
});

export const HeroBlockSchema = BaseBlockSchema.extend({
  type: z.literal('hero'),
  data: z.object({
    kicker: z.string().default('COMPANY'),
    headline: z.string().default(''),
    body: z.string().default(''),
    mediaUrl: z.string().optional(),
    primaryLabel: z.string().optional(),
    primaryHref: z.string().optional(),
  }),
});

export const StatementBlockSchema = BaseBlockSchema.extend({
  type: z.literal('statement'),
  data: z.object({
    eyebrow: z.string().default('Statement'),
    title: z.string().min(1),
    body: z.string().default(''),
    items: z.array(z.string()).default([]),
  }),
});

export const TimelineBlockSchema = BaseBlockSchema.extend({
  type: z.literal('timeline'),
  data: z.object({
    title: z.string().default('Timeline'),
    body: z.string().default(''),
    summaryItems: z
      .array(
        z.object({
          label: z.string().default(''),
          value: z.string().default(''),
        }),
      )
      .default([]),
    items: z
      .array(
        z.object({
          date: z.string().default(''),
          title: z.string().default(''),
          body: z.string().default(''),
          icon: z.string().optional(),
          details: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  }),
});

export const MetricGridBlockSchema = BaseBlockSchema.extend({
  type: z.literal('metric-grid'),
  data: z.object({
    title: z.string().default('Metrics'),
    metrics: z
      .array(
        z.object({
          label: z.string().default(''),
          value: z.string().default(''),
          caption: z.string().default(''),
          icon: z.string().optional(),
          progress: z.coerce.number().min(0).max(100).optional(),
          accent: z.string().optional(),
          subLabel: z.string().optional(),
          subValue: z.string().optional(),
          secondaryProgress: z.coerce.number().min(0).max(100).optional(),
          secondaryAccent: z.string().optional(),
          secondaryLabel: z.string().optional(),
          secondaryValue: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

export const FeatureGridBlockSchema = BaseBlockSchema.extend({
  type: z.literal('feature-grid'),
  data: z.object({
    title: z.string().default('Features'),
    features: z
      .array(
        z.object({
          title: z.string().default(''),
          body: z.string().default(''),
          meta: z.string().optional(),
          icon: z.string().optional(),
          subtitle: z.string().optional(),
          mediaUrl: z.string().optional(),
          mediaAlt: z.string().optional(),
          accent: z.string().optional(),
          statLabel: z.string().optional(),
          statValue: z.string().optional(),
          details: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  }),
});

export const PeopleGridBlockSchema = BaseBlockSchema.extend({
  type: z.literal('people-grid'),
  data: z.object({
    title: z.string().default('People'),
    people: z
      .array(
        z.object({
          name: z.string().default(''),
          role: z.string().default(''),
          bio: z.string().default(''),
          imageUrl: z.string().optional(),
          icon: z.string().optional(),
          englishName: z.string().optional(),
          department: z.string().optional(),
          departmentKey: z.string().optional(),
          location: z.string().optional(),
          status: z.string().optional(),
          quote: z.string().optional(),
          accent: z.string().optional(),
          skills: z.array(z.string()).optional(),
          metrics: z
            .array(
              z.object({
                label: z.string().default(''),
                value: z.string().default(''),
              }),
            )
            .optional(),
          milestones: z
            .array(
              z.object({
                year: z.string().default(''),
                title: z.string().default(''),
                detail: z.string().default(''),
              }),
            )
            .optional(),
          cheers: z.array(z.string()).optional(),
        }),
      )
      .default([]),
  }),
});

export const MediaShowcaseBlockSchema = BaseBlockSchema.extend({
  type: z.literal('media-showcase'),
  data: z.object({
    title: z.string().default('Media'),
    body: z.string().default(''),
    media: z
      .array(
        z.object({
          url: z.string().default(''),
          type: z.enum(['image', 'video', 'embed']).default('image'),
          alt: z.string().default(''),
          caption: z.string().optional(),
          description: z.string().optional(),
          height: z.number().optional(),
        }),
      )
      .default([]),
  }),
});

export const QuoteBlockSchema = BaseBlockSchema.extend({
  type: z.literal('quote'),
  data: z.object({
    quote: z.string().default(''),
    cite: z.string().optional(),
  }),
});

export const CtaBlockSchema = BaseBlockSchema.extend({
  type: z.literal('cta'),
  data: z.object({
    title: z.string().default(''),
    body: z.string().default(''),
    label: z.string().default('문의하기'),
    href: z.string().default('/corp/partnership/business'),
  }),
});

export const CorpPageBlockSchema = z.discriminatedUnion('type', [
  HeroBlockSchema,
  StatementBlockSchema,
  TimelineBlockSchema,
  MetricGridBlockSchema,
  FeatureGridBlockSchema,
  PeopleGridBlockSchema,
  MediaShowcaseBlockSchema,
  QuoteBlockSchema,
  CtaBlockSchema,
]);

export const CorpPageSeoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

export const SocialContributionTemplateSettingsSchema = z.object({
  initialImpactPoints: z.number().min(0).max(999999).optional(),
  lottoWarmupMs: z.number().min(200).max(5000).optional(),
  lottoStepIntervalMs: z.number().min(700).max(6000).optional(),
  lottoRollDurationMs: z.number().min(400).max(4000).optional(),
  scratchRevealThreshold: z.number().min(20).max(90).optional(),
  noticeText: z.string().optional(),
});

export const CorpPageTemplateSettingsSchema = z
  .object({
    socialContribution: SocialContributionTemplateSettingsSchema.optional(),
  })
  .default({});

export const CorpPageMenuSchema = z.object({
  label: z.string().optional(),
  icon: z.string().optional(),
});

export const CorpPageSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(''),
  status: CorpPageStatusSchema.default('draft'),
  order: z.number().default(0),
  hidden: z.boolean().default(false),
  templateKey: CorpPageTemplateKeySchema.default('generic'),
  blocks: z.array(CorpPageBlockSchema).default([]),
  menu: CorpPageMenuSchema.default({}),
  seo: CorpPageSeoSchema.default({}),
  templateSettings: CorpPageTemplateSettingsSchema,
  createdAt: z.unknown().optional(),
  updatedAt: z.unknown().optional(),
});

export const CorpPageVersionSchema = CorpPageSchema.extend({
  versionId: z.string().min(1),
  pageId: z.string().min(1),
  versionCreatedAt: z.unknown().optional(),
  versionCreatedBy: z.string().optional(),
  versionReason: z.string().optional(),
});

export type CorpPageStatus = z.infer<typeof CorpPageStatusSchema>;
export type CorpPageTemplateKey = z.infer<typeof CorpPageTemplateKeySchema>;
export type CorpPageBlock = z.infer<typeof CorpPageBlockSchema>;
export type CorpPage = z.infer<typeof CorpPageSchema>;
export type CorpPageVersion = z.infer<typeof CorpPageVersionSchema>;
export type SocialContributionTemplateSettings = z.infer<typeof SocialContributionTemplateSettingsSchema>;

export type CorpPageInput = Omit<CorpPage, 'createdAt' | 'updatedAt'>;
export type CorpPageUpdate = Partial<Omit<CorpPage, 'id' | 'createdAt' | 'updatedAt'>>;
