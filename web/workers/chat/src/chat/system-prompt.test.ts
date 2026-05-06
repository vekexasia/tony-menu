import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './system-prompt';
import type { MenuDataCache } from '../types';

const fixture: MenuDataCache = {
  restaurant: {
    name: 'Tony Test Kitchen',
    payoff: 'Simple Italian food',
  },
  categories: [
    {
      id: 'pasta',
      name: 'Pasta',
      order: 1,
      variantPaths: [],
      extraPaths: [],
      entries: [
        {
          id: 'spaghetti-al-pomodoro',
          categoryId: 'pasta',
          name: 'Spaghetti al Pomodoro',
          description: 'Tomato sauce and basil',
          price: 12,
          outOfStock: false,
          containsFrozenIngredient: false,
          allergens: ['Glutine'],
          menuVisibility: ['menu'],
        },
      ],
    },
  ],
  variants: [],
  extras: [],
  chatAgentPrompt: 'Owner instruction: mention the terrace when relevant.',
};

describe('buildSystemPrompt allergy safety', () => {
  it('includes allergy and intolerance safety instructions', () => {
    const prompt = buildSystemPrompt(fixture, 'en', 'English');

    expect(prompt).toMatch(/Allergy and intolerance safety/i);
  });

  it('requires waiter confirmation for safety-sensitive answers', () => {
    const prompt = buildSystemPrompt(fixture, 'en', 'English');

    expect(prompt).toMatch(/confirm with the waiter before ordering/i);
  });

  it('forbids guaranteeing that items are safe', () => {
    const prompt = buildSystemPrompt(fixture, 'en', 'English');

    expect(prompt).toMatch(/Never guarantee that (?:any|an) item is safe, allergen-free, contamination-free, or suitable/i);
  });

  it('repeats allergy safety in the final reminder after owner instructions', () => {
    const prompt = buildSystemPrompt(fixture, 'en', 'English');

    const ownerIndex = prompt.indexOf('Owner instruction: mention the terrace when relevant.');
    const finalReminderIndex = prompt.indexOf('## FINAL REMINDER');
    const allergyReminderIndex = prompt.search(/ALLERGY SAFETY/i);

    expect(ownerIndex).toBeGreaterThan(-1);
    expect(finalReminderIndex).toBeGreaterThan(ownerIndex);
    expect(allergyReminderIndex).toBeGreaterThan(finalReminderIndex);
  });
});
