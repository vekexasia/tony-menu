import { z } from 'zod';

export const OrderingModeSchema = z.enum(['summary', 'send']);
export type OrderingMode = z.infer<typeof OrderingModeSchema>;

export const OrderingModuleConfigSchema = z.object({
  enabled: z.boolean(),
  mode: OrderingModeSchema,
});
export type OrderingModuleConfig = z.infer<typeof OrderingModuleConfigSchema>;

export const AiModuleConfigSchema = z.object({
  enabled: z.boolean(),
  voiceEnabled: z.boolean(),
});
export type AiModuleConfig = z.infer<typeof AiModuleConfigSchema>;

export const AnalyticsModuleConfigSchema = z.object({
  enabled: z.boolean(),
});
export type AnalyticsModuleConfig = z.infer<typeof AnalyticsModuleConfigSchema>;

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
  ordering: { enabled: false, mode: 'summary' },
  ai: { enabled: false, voiceEnabled: false },
  analytics: { enabled: true },
};

export function normalizeModulesConfig(
  modules: unknown,
  legacy: { selectionEnabled?: boolean | null; aiChatEnabled?: boolean | null; aiVoiceEnabled?: boolean | null } = {},
): NormalizedModulesConfig {
  const parsed = ModulesConfigSchema.safeParse(modules ?? {});
  const config = parsed.success ? parsed.data : {};
  const aiEnabled = legacy.aiChatEnabled ?? DEFAULT_MODULES_CONFIG.ai.enabled;
  return {
    ordering: config.ordering ?? { enabled: legacy.selectionEnabled ?? DEFAULT_MODULES_CONFIG.ordering.enabled, mode: 'summary' },
    ai: config.ai ?? { enabled: aiEnabled, voiceEnabled: aiEnabled && (legacy.aiVoiceEnabled ?? DEFAULT_MODULES_CONFIG.ai.voiceEnabled) },
    analytics: config.analytics ?? DEFAULT_MODULES_CONFIG.analytics,
  };
}
