import { describe, it, expect } from 'vitest';
import { I18nMapSchema } from '../common.js';

describe('common schemas', () => {
  it('I18nMapSchema accepts locale->field->string, rejects non-string values', () => {
    expect(I18nMapSchema.safeParse({ en: { name: 'Pizza' } }).success).toBe(true);
    expect(I18nMapSchema.safeParse({ en: { name: 5 } }).success).toBe(false);
  });
});
