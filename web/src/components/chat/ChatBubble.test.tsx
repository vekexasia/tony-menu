import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChatBubble } from './ChatBubble';
import { useRestaurantStore } from '@/stores/restaurantStore';
import type { RestaurantData } from '@/lib/types';

const restaurantData: RestaurantData = {
  id: 'singleton',
  name: 'Tony Test Kitchen',
  menus: [],
  labels: [
    { id: 'label-new', name: 'Novità', color: 'amber', sortOrder: 0, i18n: { en: { name: 'New' } } },
  ],
  categories: [
    {
      id: 'cat-1',
      path: 'menuEntries/cat-1',
      name: 'Category One',
      order: 0,
      variantPaths: [],
      extraPaths: [],
      entries: [
        {
          id: 'entry-1',
          path: 'menuEntries/cat-1/entries/entry-1',
          categoryPath: 'menuEntries/cat-1',
          name: 'Ravioli',
          description: 'Filled pasta',
          price: 12,
          order: 0,
          outOfStock: false,
          containsFrozenIngredient: false,
          allergens: [],
          menuIds: ['menu-food'],
          hidden: false,
          labelIds: ['label-new'],
        },
      ],
    },
  ],
};

describe('ChatBubble item cards', () => {
  beforeEach(() => {
    useRestaurantStore.getState().setData(restaurantData);
  });

  it('shows localized labels on recommended item cards', () => {
    render(
      <ChatBubble
        message={{ id: 'm1', role: 'assistant', content: 'Try this.', timestamp: 1, showItemIds: ['entry-1'] }}
        locale="en"
        onItemClick={() => {}}
      />,
    );

    expect(screen.getByText('Ravioli')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });
});
