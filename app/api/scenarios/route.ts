import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { SCENARIO_SYSTEM_PROMPT } from '@/lib/prompts';

export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response('Unauthorized', { status: 401 });

  const { type, params } = (await req.json()) as {
    type: string;
    params: Record<string, string | number>;
  };

  const userPrompt = buildScenarioPrompt(type, params);

  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    system: SCENARIO_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return result.toDataStreamResponse();
}

function buildScenarioPrompt(type: string, p: Record<string, string | number>): string {
  switch (type) {
    case 'iso':
      return `Analyze this ISO stock option exercise scenario:
- Shares to exercise: ${p.shares}
- Strike price: $${p.strike}
- Current FMV: $${p.fmv}
- Tax year: ${p.year ?? new Date().getFullYear()}
- Current AGI (estimated): $${p.agi ?? 'unknown'}
- Filing status: ${p.filing_status ?? 'single'}
- State: ${p.state ?? 'unknown'}

Calculate: AMT preference item, tentative minimum tax impact, whether to exercise now vs wait, and India RNOR implications if applicable.`;

    case 'rnor':
      return `Analyze RNOR (Resident but Not Ordinarily Resident) tax status for India:
- Year of return to India: ${p.return_year}
- Years abroad (NRI): ${p.years_abroad}
- Annual US salary (if still earning): $${p.us_salary ?? 0}
- Foreign investments/income: $${p.foreign_income ?? 0}
- India-sourced income: ₹${p.india_income ?? 0}

Determine RNOR eligibility, duration of window, which income is taxable in India, DTAA benefits, and recommended actions.`;

    case 'capital_gains':
      return `Analyze capital gains tax for this sale:
- Asset: ${p.asset_name}
- Purchase date: ${p.purchase_date}
- Sale date: ${p.sale_date ?? 'today'}
- Cost basis: $${p.cost_basis}
- Sale price: $${p.sale_price}
- Other AGI this year: $${p.agi ?? 0}
- Filing status: ${p.filing_status ?? 'single'}
- State: ${p.state ?? 'unknown'}

Calculate: LTCG vs STCG, federal rate, NIIT applicability, state tax, net proceeds.`;

    case 'rental':
      return `Analyze rental property tax and cashflow:
- Monthly rent: $${p.monthly_rent}
- Monthly mortgage (P&I): $${p.mortgage ?? 0}
- Annual property tax: $${p.property_tax ?? 0}
- Annual insurance: $${p.insurance ?? 0}
- Annual maintenance/repairs: $${p.maintenance ?? 0}
- Property management fee: ${p.mgmt_pct ?? 0}% of rent
- Purchase price: $${p.purchase_price ?? 0}
- Depreciation basis: $${p.depr_basis ?? 0}
- Other AGI: $${p.agi ?? 0}

Calculate: NOI, annual cashflow, Schedule E income/loss, depreciation deduction, passive activity rules, effective tax benefit.`;

    default:
      return `Analyze this financial scenario:\n${JSON.stringify(p, null, 2)}`;
  }
}
