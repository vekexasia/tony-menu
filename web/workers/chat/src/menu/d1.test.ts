import { describe, expect, it, vi } from 'vitest';
import { fetchMenuFromD1 } from './d1';
import type { Env } from '../types';

function makeEnv() {
  const first = vi.fn(async () => ({ name: 'Trattoria Demo', payoff: null, chat_agent_prompt: null }));
  const responses = [
    {
      results: [
        { id: 'cat-1', name: 'Pasta', sort_order: 0, i18n: null },
      ],
    },
    {
      results: [
        {
          id: 'entry-visible',
          category_id: 'cat-1',
          name: 'Ravioli',
          description: 'Homemade ravioli',
          price: 1450,
          price_unit: null,
          out_of_stock: 0,
          frozen: 0,
          hidden: 0,
          allergens: '["Glutine"]',
          i18n: null,
        },
        {
          id: 'entry-hidden',
          category_id: 'cat-1',
          name: 'Secret dish',
          description: null,
          price: 1000,
          price_unit: null,
          out_of_stock: 0,
          frozen: 0,
          hidden: 1,
          allergens: null,
          i18n: null,
        },
      ],
    },
    {
      results: [
        { entry_id: 'entry-visible', menu_id: 'menu-food' },
      ],
    },
    { results: [] },
    { results: [] },
  ];
  const all = vi.fn(async () => responses.shift());
  const prepare = vi.fn((sql: string) => ({ first, all, sql }));

  return {
    env: { DB: { prepare } as unknown as D1Database } as Env,
    prepare,
  };
}

describe('fetchMenuFromD1', () => {
  it('reads current multi-menu schema instead of legacy visibility column', async () => {
    const { env, prepare } = makeEnv();

    const data = await fetchMenuFromD1(env);

    const sql = prepare.mock.calls.map(([query]) => query).join('\n');
    expect(sql).not.toContain('visibility');
    expect(sql).toContain('menu_entry_memberships');
    expect(sql).toContain('m.published = 1');

    expect(data.categories[0].entries).toMatchObject([
      { id: 'entry-visible', menuVisibility: ['menu-food'], allergens: ['Glutine'] },
      { id: 'entry-hidden', menuVisibility: [] },
    ]);
  });
});
