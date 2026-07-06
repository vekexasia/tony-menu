import { Suspense } from 'react';
import { SelectionPageClient } from './SelectionPageClient';

export default function SelectionPage() {
  return (
    <Suspense fallback={null}>
      <SelectionPageClient />
    </Suspense>
  );
}
