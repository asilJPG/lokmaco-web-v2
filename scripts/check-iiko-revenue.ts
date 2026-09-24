import { resolveIikoCreds } from '@/lib/filial-iiko';
import { withIikoSession } from '@/lib/iiko';

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');

async function main() {
  const date = '2026-09-17';
  const nextDay = '2026-09-18';

  const { xml: creds } = await resolveIikoCreds(1);

  await withIikoSession(async (token) => {
    // 1. Выручка по типам оплат
    const payRes = await fetch(`${creds.server}/resto/api/v2/reports/olap`, {
      method: 'POST',
      headers: { Cookie: `key=${token}`, 'Content-Type': 'application/json', 'User-Agent': BROWSER_UA },
      body: JSON.stringify({
        reportType: 'SALES',
        buildSummary: 'false',
        groupByRowFields: ['PayTypes'],
        groupByColFields: [],
        aggregateFields: ['DishDiscountSumInt'],
        filters: {
          'OpenDate.Typed': {
            filterType: 'DateRange',
            periodType: 'CUSTOM',
            from: date,
            to: nextDay,
            includeLow: 'true',
            includeHigh: 'false',
          },
          DeletedWithWriteoff: { filterType: 'ExcludeValues', values: ['DELETED_WITHOUT_WRITEOFF'] },
        },
      }),
    });

    const payJson = await payRes.json();
    console.log('=== ВЫРУЧКА iiko ЗА 17.09.2026 ПО ТИПАМ ОПЛАТ ===\n');

    let iikoTotal = 0;
    const rows = (payJson?.data ?? []) as Record<string, unknown>[];
    rows.sort((a, b) => Math.abs(Number(b['DishDiscountSumInt'])) - Math.abs(Number(a['DishDiscountSumInt'])));
    for (const row of rows) {
      const payType = String(row['PayTypes'] ?? '—');
      const sum = Math.abs(Number(row['DishDiscountSumInt'] ?? 0));
      iikoTotal += sum;
      console.log(`  ${payType.padEnd(30)} ${fmt(sum).padStart(15)} сум`);
    }
    console.log(`  ${'─'.repeat(47)}`);
    console.log(`  ${'ИТОГО iiko'.padEnd(30)} ${fmt(iikoTotal).padStart(15)} сум`);

    // 2. Что кассир ввёл
    console.log('\n=== КАССИР ВВЁЛ ===\n');
    const cashierData = {
      'Наличные': 6_599_000,
      'Инкассация': 4_192_000,
      'Uzcard': 3_699_840,
      'Humo': 2_897_030,
      'Rahmat': 309,
      'Uzum': 0,
      'Online': 0,
      'Yandex': 0,
    };
    let cashierTotal = 0;
    for (const [k, v] of Object.entries(cashierData)) {
      if (v > 0) console.log(`  ${k.padEnd(30)} ${fmt(v).padStart(15)} сум`);
      cashierTotal += v;
    }
    console.log(`  ${'─'.repeat(47)}`);
    console.log(`  ${'ИТОГО кассир'.padEnd(30)} ${fmt(cashierTotal).padStart(15)} сум`);

    console.log(`\n=== РАЗНИЦА ===`);
    console.log(`  ИТОГО iiko:   ${fmt(iikoTotal)} сум`);
    console.log(`  ИТОГО кассир: ${fmt(cashierTotal)} сум`);
    console.log(`  Разница:      ${fmt(cashierTotal - iikoTotal)} сум`);

  }, creds);
}

main().catch(console.error).finally(() => process.exit());
