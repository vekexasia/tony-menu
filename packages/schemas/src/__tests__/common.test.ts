import { describe, it, expect } from 'vitest';
import {
  MembershipRoleSchema,
  AllergenSchema,
  ExtrasTypeSchema,
  AnalyticsPeriodSchema,
  PublicationStateSchema,
  I18nMapSchema,
} from '../common.js';

describe('common schemas', () => {
  it('MembershipRoleSchema accepts a known role, rejects others', () => {
    expect(MembershipRoleSchema.safeParse('manager').success).toBe(true);
    expect(MembershipRoleSchema.safeParse('intern').success).toBe(false);
  });
  it('AllergenSchema validates the enum', () => {
    expect(AllergenSchema.safeParse('Glutine').success).toBe(true);
    expect(AllergenSchema.safeParse('Peanuts').success).toBe(false);
  });
  it('ExtrasTypeSchema validates the enum', () => {
    expect(ExtrasTypeSchema.safeParse('zeroorone').success).toBe(true);
    expect(ExtrasTypeSchema.safeParse('many').success).toBe(false);
  });
  it('AnalyticsPeriodSchema validates the enum', () => {
    expect(AnalyticsPeriodSchema.safeParse('7d').success).toBe(true);
    expect(AnalyticsPeriodSchema.safeParse('1y').success).toBe(false);
  });
  it('PublicationStateSchema only allows draft|published', () => {
    expect(PublicationStateSchema.safeParse('published').success).toBe(true);
    expect(PublicationStateSchema.safeParse('archived').success).toBe(false);
  });
  it('I18nMapSchema accepts locale->field->string, rejects non-string values', () => {
    expect(I18nMapSchema.safeParse({ en: { name: 'Pizza' } }).success).toBe(true);
    expect(I18nMapSchema.safeParse({ en: { name: 5 } }).success).toBe(false);
  });
});
