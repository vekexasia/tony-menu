import { describe, it, expect } from 'vitest';
import {
  OrderingModeSchema,
  OrderingModuleConfigSchema,
  AiModuleConfigSchema,
  AnalyticsModuleConfigSchema,
  ModulesConfigSchema,
  normalizeModulesConfig,
} from '../modules.js';

describe('modules schemas', () => {
  it('OrderingModeSchema validates summary|send', () => {
    expect(OrderingModeSchema.safeParse('send').success).toBe(true);
    expect(OrderingModeSchema.safeParse('print').success).toBe(false);
  });
  it('OrderingModuleConfigSchema requires enabled+mode', () => {
    expect(OrderingModuleConfigSchema.safeParse({ enabled: true, mode: 'summary' }).success).toBe(true);
    expect(OrderingModuleConfigSchema.safeParse({ enabled: true }).success).toBe(false);
  });
  it('AiModuleConfigSchema requires both booleans', () => {
    expect(AiModuleConfigSchema.safeParse({ enabled: true, voiceEnabled: false }).success).toBe(true);
    expect(AiModuleConfigSchema.safeParse({ enabled: true }).success).toBe(false);
  });
  it('AnalyticsModuleConfigSchema requires enabled', () => {
    expect(AnalyticsModuleConfigSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(AnalyticsModuleConfigSchema.safeParse({}).success).toBe(false);
  });
  it('ModulesConfigSchema rejects unknown keys (strict)', () => {
    expect(ModulesConfigSchema.safeParse({ ai: { enabled: true, voiceEnabled: false } }).success).toBe(true);
    expect(ModulesConfigSchema.safeParse({ unknown: true }).success).toBe(false);
  });
  it('normalizeModulesConfig fills defaults from empty input', () => {
    expect(normalizeModulesConfig({})).toEqual({
      ordering: { enabled: false, mode: 'summary' },
      ai: { enabled: false, voiceEnabled: false },
      analytics: { enabled: true },
    });
  });
  it('normalizeModulesConfig respects legacy ai flags', () => {
    expect(normalizeModulesConfig({}, { aiChatEnabled: true, aiVoiceEnabled: true })).toEqual({
      ordering: { enabled: false, mode: 'summary' },
      ai: { enabled: true, voiceEnabled: true },
      analytics: { enabled: true },
    });
  });
});
