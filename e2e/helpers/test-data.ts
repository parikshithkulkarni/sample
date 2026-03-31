/** Shared test data constants for E2E tests */

export const TEST_ACCOUNTS = [
  { id: '1', name: 'Fidelity 401k', type: 'asset', category: '401k', balance: 125000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
  { id: '2', name: 'Chase Checking', type: 'asset', category: 'checking', balance: 15000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
  { id: '3', name: 'Vanguard Brokerage', type: 'asset', category: 'brokerage', balance: 85000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
  { id: '4', name: 'Home Mortgage', type: 'liability', category: 'mortgage', balance: 350000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
  { id: '5', name: 'Chase Credit Card', type: 'liability', category: 'credit_card', balance: 5000, currency: 'USD', notes: null, updated_at: '2025-01-15T00:00:00Z' },
];

export const TEST_DEADLINES = [
  { id: '1', title: 'Federal Tax Return', due_date: '2025-04-15', category: 'tax_us', notes: 'File Form 1040', is_done: false, is_recurring: true },
  { id: '2', title: 'India ITR Filing', due_date: '2025-07-31', category: 'tax_india', notes: null, is_done: false, is_recurring: true },
  { id: '3', title: 'H1B Visa Renewal', due_date: '2025-03-01', category: 'visa', notes: 'Prepare documents', is_done: true, is_recurring: false },
  { id: '4', title: 'Property Tax Q1', due_date: '2025-02-01', category: 'property', notes: null, is_done: false, is_recurring: true },
];

export const TEST_PROPERTIES = [
  { id: 'p1', address: '123 Main St, San Francisco, CA', purchase_price: 800000, purchase_date: '2020-06-15', market_value: 950000, mortgage_balance: 600000, notes: 'Primary rental' },
  { id: 'p2', address: '456 Oak Ave, Austin, TX', purchase_price: 400000, purchase_date: '2022-01-10', market_value: 450000, mortgage_balance: 320000, notes: null },
];

export const TEST_RENTAL_RECORDS = [
  { id: 'r1', property_id: 'p1', year: 2024, month: 1, rent_collected: 4500, vacancy_days: 0, mortgage_pmt: 3200, expenses: { property_tax: 800, insurance: 200, maintenance: 100 }, notes: null },
  { id: 'r2', property_id: 'p1', year: 2024, month: 2, rent_collected: 4500, vacancy_days: 0, mortgage_pmt: 3200, expenses: { property_tax: 800, insurance: 200 }, notes: null },
  { id: 'r3', property_id: 'p1', year: 2024, month: 3, rent_collected: 4500, vacancy_days: 5, mortgage_pmt: 3200, expenses: { property_tax: 800, insurance: 200, repairs: 500 }, notes: 'Plumbing repair' },
];

export const TEST_DOCUMENTS = [
  { id: 'd1', name: 'W2-2024.pdf', tags: ['tax', '2024'], summary: 'W2 wage statement for 2024', insights: ['Total wages: $200,000', 'Federal tax withheld: $45,000'], added_at: '2025-01-10T00:00:00Z', extracted_at: '2025-01-10T01:00:00Z' },
  { id: 'd2', name: 'Bank-Statement-Jan.pdf', tags: ['bank', '2025'], summary: 'Chase bank statement for January 2025', insights: null, added_at: '2025-02-01T00:00:00Z', extracted_at: null },
];

export const TEST_CHAT_SESSIONS = [
  { id: 's1', title: 'Tax planning discussion', message_count: 5, created_at: '2025-01-15T10:00:00Z', updated_at: '2025-01-15T11:00:00Z' },
  { id: 's2', title: 'Net worth analysis', message_count: 3, created_at: '2025-01-14T09:00:00Z', updated_at: '2025-01-14T09:30:00Z' },
];

export const TEST_AUDIT_DATA = {
  summary: {
    totalAccounts: 5,
    totalProperties: 2,
    totalDocuments: 2,
    documentsExtracted: 1,
    documentsNotExtracted: 1,
    totalRentalRecords: 3,
    issuesByType: { duplicate_accounts: 1, missing_extraction: 1 },
    autoFixableCount: 1,
  },
  issues: [
    { type: 'duplicate_accounts', severity: 'error' as const, entity: 'account', ids: ['1', '6'], description: 'Duplicate account: Fidelity 401k', suggestion: 'Merge these accounts', autoFixable: true },
    { type: 'missing_extraction', severity: 'warning' as const, entity: 'document', ids: ['d2'], description: 'Document not yet extracted: Bank-Statement-Jan.pdf', suggestion: 'Run extraction to import financial data', autoFixable: false },
  ],
  accounts: TEST_ACCOUNTS.map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category, balance: a.balance })),
  properties: TEST_PROPERTIES.map(p => ({ id: p.id, address: p.address, purchase_date: p.purchase_date, market_value: p.market_value, mortgage_balance: p.mortgage_balance })),
  documents: TEST_DOCUMENTS.map(d => ({ id: d.id, name: d.name, extracted: !!d.extracted_at })),
};

export const TEST_TAX_RETURN_US = {
  id: 'tr1',
  tax_year: 2024,
  country: 'US',
  data: {
    filing_status: 'single',
    income: { wages: 200000, interest: 500, dividends: 1200, capital_gains: 0, rental_income: 0, other_income: 0 },
    adjustments: { ira_deduction: 0, student_loan_interest: 0, hsa_deduction: 3650, self_employment_tax: 0 },
    deductions: { type: 'standard', standard_amount: 14600, salt: 0, mortgage_interest: 0, charitable: 0, medical: 0 },
    credits: { child_credit: 0, education_credit: 0, foreign_tax_credit: 0, other_credits: 0 },
    other_taxes: { self_employment: 0, amt: 0, net_investment_income: 0 },
    payments: { federal_withheld: 45000, estimated_payments: 0, other_payments: 0 },
    iso_amt: { shares_exercised: 0, strike_price: 0, fmv_at_exercise: 0, amt_preference: 0 },
    fbar: { has_foreign_accounts: false, max_aggregate_value: 0 },
  },
  sources: {},
  updated_at: '2025-01-15T00:00:00Z',
};

export const TEST_SNAPSHOTS = [
  { snapshot_date: '2025-01-01', net_worth: -120000, total_assets: 225000, total_liabilities: 345000 },
  { snapshot_date: '2025-01-08', net_worth: -115000, total_assets: 230000, total_liabilities: 345000 },
  { snapshot_date: '2025-01-15', net_worth: -130000, total_assets: 225000, total_liabilities: 355000 },
];

export const TEST_SETUP_STATUS = {
  vars: [
    { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API Key', hint: 'Get one at console.anthropic.com', ok: true, required: true },
    { key: 'DATABASE_URL', label: 'Database URL', hint: 'Connect a Postgres database', ok: true, required: true },
  ],
  dbReady: true,
  dbError: '',
  allRequired: true,
  adminExists: false,
  ready: false,
};
