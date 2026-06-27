import { describe, expect, it } from 'vitest';
import { toJsonSchemaParams } from './tools';

describe('toJsonSchemaParams', () => {
  it('maps string and string[] params and collects required names', () => {
    const schema = toJsonSchemaParams([
      { name: 'q', type: 'string', description: 'query', required: true },
      { name: 'tags', type: 'string[]', description: 'tags', required: false },
    ]);

    expect(schema.type).toBe('object');
    expect(schema.properties.q).toEqual({ type: 'string', description: 'query' });
    expect(schema.properties.tags).toEqual({
      type: 'array',
      items: { type: 'string' },
      description: 'tags',
    });
    expect(schema.required).toEqual(['q']);
  });

  it('returns an empty required array when nothing is required', () => {
    const schema = toJsonSchemaParams([
      { name: 'q', type: 'string', description: 'query', required: false },
    ]);
    expect(schema.required).toEqual([]);
  });
});
