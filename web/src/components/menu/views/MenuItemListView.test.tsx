import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MenuItemListView, type MenuItemView } from './MenuItemListView';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { src, alt, ...rest } = props;
    delete rest.fill;
    delete rest.sizes;
    delete rest.unoptimized;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src as string} alt={alt as string} {...rest} />;
  },
}));

const item: MenuItemView = {
  name: 'Bruschetta',
  internalCode: '042',
  description: 'Pane tostato',
  price: 7.5,
};

describe('MenuItemListView internal code layout', () => {
  it('shows the internal code inline after the item title', () => {
    render(<MenuItemListView item={item} />);

    const heading = screen.getByRole('heading', { level: 4 });
    const code = screen.getByText('042');

    expect(heading).toHaveTextContent('Bruschetta042');
    expect(code).toHaveClass('ml-2', 'font-mono', 'text-xs');
  });
});
