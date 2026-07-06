import type { APIRequestContext, APIResponse } from '@playwright/test';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8787';

async function requireOk(response: APIResponse, label: string) {
  if (response.ok()) return;
  throw new Error(`${label} failed with ${response.status()}: ${await response.text()}`);
}

export async function setupDemoMenuSelection(request: APIRequestContext, enabled: boolean) {
  await requireOk(await request.post(`${API_URL}/admin/demo/reset`), 'demo reset');
  await requireOk(await request.put(`${API_URL}/admin/modules`, {
    data: { ordering: { enabled, mode: 'summary', submitMode: 'diner' } },
  }), 'ordering setup');
}
