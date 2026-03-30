// Global test setup — suppress console noise from routes
import { vi } from 'vitest';

// Silence console.error in tests (expected from non-fatal catches)
vi.spyOn(console, 'error').mockImplementation(() => {});
