import type { Page } from '@playwright/test';

/**
 * Route-level API mock helpers for E2E tests.
 * Uses page.route() to intercept fetch calls, avoiding the need for a real database.
 */

export async function mockSetupAPI(page: Page, status: Record<string, unknown>) {
  await page.route('**/api/setup', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: status });
    } else if (route.request().method() === 'POST') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
}

export async function mockFinanceAPI(page: Page, accounts: Record<string, unknown>[]) {
  await page.route('**/api/finance/cleanup', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/finance/dedup', async (route) => {
    await route.fulfill({ json: { merged: 1 } });
  });
  await page.route('**/api/finance/snapshots', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/finance/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      const id = route.request().url().split('/').pop();
      const account = accounts.find((a) => a.id === id);
      await route.fulfill({ json: { ...account, ...body } });
    } else if (method === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/finance', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: accounts });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'new-1', ...body, updated_at: new Date().toISOString() } });
    } else {
      await route.continue();
    }
  });
}

export async function mockDeadlinesAPI(page: Page, deadlines: Record<string, unknown>[]) {
  await page.route('**/api/deadlines/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      const id = route.request().url().split('/').pop();
      const deadline = deadlines.find((d) => d.id === id);
      await route.fulfill({ json: { ...deadline, ...body } });
    } else if (method === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/deadlines', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: deadlines });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'new-dl-1', ...body } });
    } else {
      await route.continue();
    }
  });
}

export async function mockRentalsAPI(page: Page, properties: Record<string, unknown>[], records: Record<string, unknown>[] = []) {
  await page.route('**/api/rentals/dedup', async (route) => {
    await route.fulfill({ json: { merged: 0 } });
  });
  await page.route('**/api/rentals/merge', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/rentals/*/records*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      // Extract the property ID from the URL and filter records accordingly
      const urlPath = new URL(route.request().url()).pathname;
      const segments = urlPath.split('/');
      // URL pattern: /api/rentals/<propertyId>/records
      const propertyIdIdx = segments.indexOf('rentals') + 1;
      const propertyId = segments[propertyIdIdx];
      const filtered = records.filter(
        (r) => (r as Record<string, unknown>).property_id === propertyId,
      );
      await route.fulfill({ json: filtered });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'new-rec-1', ...body } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/rentals/*', async (route) => {
    const method = route.request().method();
    const url = route.request().url();
    // Skip if this is the dedup/merge/records route (already handled)
    if (url.includes('/dedup') || url.includes('/merge') || url.includes('/records')) {
      await route.continue();
      return;
    }
    // Extract the property ID from the URL path, ignoring query params
    const urlPath = new URL(url).pathname;
    const id = urlPath.split('/').pop();
    if (method === 'GET') {
      const prop = properties.find((p) => (p as Record<string, unknown>).id === id);
      await route.fulfill({ json: prop ?? {} });
    } else if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      const prop = properties.find((p) => (p as Record<string, unknown>).id === id);
      await route.fulfill({ json: { ...prop, ...body } });
    } else if (method === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/rentals', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: properties });
    } else if (method === 'POST') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { id: 'new-prop-1', ...body } });
    } else {
      await route.continue();
    }
  });
}

export async function mockDocumentsAPI(page: Page, docs: Record<string, unknown>[]) {
  await page.route('**/api/documents/extract-all', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/documents/reindex', async (route) => {
    await route.fulfill({ json: { ok: true, indexed: docs.length } });
  });
  await page.route('**/api/documents/*/extract-preview', async (route) => {
    await route.fulfill({
      json: {
        accounts: [{ name: 'Extracted Account', type: 'asset', category: 'checking', balance: 10000, currency: 'USD', notes: '' }],
        properties: [],
        rentalRecords: [],
      },
    });
  });
  await page.route('**/api/documents/*/extract-confirm', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/documents/*/analyze', async (route) => {
    await route.fulfill({ json: { summary: 'Test summary', insights: ['Insight 1'] } });
  });
  await page.route('**/api/documents/*/extract', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/documents/*/chunks', async (route) => {
    await route.fulfill({ json: [] });
  });
  await page.route('**/api/documents/*', async (route) => {
    const method = route.request().method();
    if (method === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
    } else if (method === 'GET') {
      const id = route.request().url().split('/').pop();
      const doc = docs.find((d) => (d as Record<string, unknown>).id === id);
      await route.fulfill({ json: doc ?? {} });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/documents', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: docs });
    } else if (method === 'POST') {
      await route.fulfill({
        json: { id: 'new-doc-1', name: 'uploaded.txt', summary: null, insights: null, chunkCount: 5 },
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockChatAPI(page: Page) {
  await page.route('**/api/chat', async (route) => {
    // Simulate a streaming response
    const body = 'This is a test response from the assistant.';
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Session-Id': 'test-session-1',
      },
      // Simplified: return the full text (non-streaming for test simplicity)
      body: `0:"${body}"\n`,
    });
  });
  await page.route('**/api/chat/sessions', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: [] });
    } else if (method === 'POST') {
      await route.fulfill({ json: { id: 'new-session-1' } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/chat/sessions/*', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        json: {
          messages: [
            { id: 'm1', role: 'user', content: 'What is my net worth?' },
            { id: 'm2', role: 'assistant', content: 'Based on your accounts, your net worth is $125,000.' },
          ],
        },
      });
    } else if (method === 'DELETE') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
}

export async function mockAuditAPI(page: Page, data: Record<string, unknown>) {
  await page.route('**/api/audit', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: data });
    } else if (method === 'POST') {
      await route.fulfill({ json: { junkDeleted: 1, mergedAccounts: 1, mergedProperties: 0 } });
    } else {
      await route.continue();
    }
  });
}

export async function mockTaxReturnsAPI(page: Page, taxReturn: Record<string, unknown>) {
  await page.route('**/api/tax-returns/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { ...taxReturn, ...body, updated_at: new Date().toISOString() } });
    } else {
      await route.continue();
    }
  });
  await page.route('**/api/tax-returns', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({ json: taxReturn });
    } else if (method === 'POST') {
      await route.fulfill({ json: { ok: true } });
    } else {
      await route.continue();
    }
  });
}

export async function mockScenariosAPI(page: Page) {
  await page.route('**/api/scenarios', async (route) => {
    const body = 'Based on your scenario, here is the tax analysis...';
    await route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: `0:"${body}"\n`,
    });
  });
}

export async function mockCaptureAPI(page: Page) {
  await page.route('**/api/capture', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
}

/** Mock all dashboard-related APIs at once */
export async function mockDashboardAPIs(
  page: Page,
  data: {
    accounts?: Record<string, unknown>[];
    deadlines?: Record<string, unknown>[];
    properties?: Record<string, unknown>[];
    snapshots?: Record<string, unknown>[];
  },
) {
  await page.route('**/api/finance/snapshots', async (route) => {
    await route.fulfill({ json: data.snapshots ?? [] });
  });
  await page.route('**/api/finance', async (route) => {
    await route.fulfill({ json: data.accounts ?? [] });
  });
  await page.route('**/api/deadlines', async (route) => {
    await route.fulfill({ json: data.deadlines ?? [] });
  });
  await page.route('**/api/rentals', async (route) => {
    await route.fulfill({ json: data.properties ?? [] });
  });
  await page.route('**/api/documents/extract-all', async (route) => {
    await route.fulfill({ json: { ok: true } });
  });
  await page.route('**/api/insights', async (route) => {
    await route.fulfill({ json: { insights: [] } });
  });
}
