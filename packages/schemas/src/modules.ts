import { z } from 'zod';

export const OrderingModeSchema = z.enum(['summary', 'send']);

export const OrderingSubmitModeSchema = z.enum(['diner', 'waiter', 'both']);
export type OrderingSubmitMode = z.infer<typeof OrderingSubmitModeSchema>;

export const OrderingModuleConfigSchema = z.object({
  enabled: z.boolean(),
  mode: OrderingModeSchema,
  // Default keeps configs stored before submitMode existed parsing successfully.
  submitMode: OrderingSubmitModeSchema.default('diner'),
});
export type OrderingModuleConfig = z.infer<typeof OrderingModuleConfigSchema>;

export const AiModuleConfigSchema = z.object({
  enabled: z.boolean(),
  voiceEnabled: z.boolean(),
});

export const AnalyticsModuleConfigSchema = z.object({
  enabled: z.boolean(),
});

export const ModulesConfigSchema = z.object({
  ordering: OrderingModuleConfigSchema.optional(),
  ai: AiModuleConfigSchema.optional(),
  analytics: AnalyticsModuleConfigSchema.optional(),
}).strict();
export type ModulesConfig = z.infer<typeof ModulesConfigSchema>;

export const NormalizedModulesConfigSchema = z.object({
  ordering: OrderingModuleConfigSchema,
  ai: AiModuleConfigSchema,
  analytics: AnalyticsModuleConfigSchema,
});
export type NormalizedModulesConfig = z.infer<typeof NormalizedModulesConfigSchema>;

export const DEFAULT_MODULES_CONFIG: NormalizedModulesConfig = {
  ordering: { enabled: false, mode: 'summary', submitMode: 'diner' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
};

export function normalizeModulesConfig(
  modules: unknown,
  legacy: { aiChatEnabled?: boolean | null; aiVoiceEnabled?: boolean | null } = {},
): NormalizedModulesConfig {
  const parsed = ModulesConfigSchema.safeParse(modules ?? {});
  const config = parsed.success ? parsed.data : {};
  const aiEnabled = legacy.aiChatEnabled ?? DEFAULT_MODULES_CONFIG.ai.enabled;
  return {
    ordering: config.ordering ?? { ...DEFAULT_MODULES_CONFIG.ordering },
    ai: config.ai ?? { enabled: aiEnabled, voiceEnabled: aiEnabled && (legacy.aiVoiceEnabled ?? DEFAULT_MODULES_CONFIG.ai.voiceEnabled) },
    analytics: config.analytics ?? DEFAULT_MODULES_CONFIG.analytics,
  };
}
