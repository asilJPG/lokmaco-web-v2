import { withIikoSession, iikoGetText } from '@/lib/iiko';
import { resolveIikoCreds } from '@/lib/filial-iiko';
import { parseStringPromise } from 'xml2js';
import type { InvoiceEntry } from '@/lib/bazaar';

// Поставщик iiko, которым отмечают закуп за наличные. Снабженец на базаре
// платит налом, поэтому в сверку идут только накладные этого контрагента.
const CASH_SUPPLIER_NAME = 'Наличные';

function first(v: unknown): string {
  if (Array.isArray(v)) return v.length ? first(v[0]) : '';
  return v == null ? '' : String(v);
}

function num(v: unknown): number {
  const n = parseFloat(first(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

type SupplierRec = { id: string; name: string };

function findSuppliers(obj: unknown, out: SupplierRec[] = []): SupplierRec[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const item of obj) findSuppliers(item, out);
    return out;
  }
  const o = obj as Record<string, unknown>;
  const id = first(o.id).trim();
  const name = first(o.name).trim();
  if (id && name && !out.find(r => r.id === id)) out.push({ id, name });
  for (const key of Object.keys(o)) findSuppliers(o[key], out);
  return out;
}

export type IikoInvoice = InvoiceEntry & { docId: string; supplier: string };

/**
 * Входящие накладные «Наличные» прямо из iiko за период [from, to] (обе границы
 * включительно). Берём из iiko, а не из наших TG-записей: если накладную правят
 * внутри iiko, наша база об этом не знает, и сверка бы врала. Источник правды —
 * iiko. Статус DELETED отбрасываем (удалённый документ не считается).
 */
export async function fetchIikoCashInvoices(
  filialId: number,
  from: string,
  to: string,
): Promise<IikoInvoice[]> {
  const { xml: creds } = await resolveIikoCreds(filialId);
  if (!creds.server || !creds.login || !creds.password) {
    throw new Error('iiko не настроен для филиала');
  }

  return withIikoSession(async (token) => {
    const supXml = await iikoGetText('suppliers', token, creds);
    const cashIds = new Set<string>();
    if (supXml) {
      const parsedSup = await parseStringPromise(supXml, { explicitArray: true });
      for (const s of findSuppliers(parsedSup)) {
        if (s.name === CASH_SUPPLIER_NAME) cashIds.add(s.id);
      }
    }
    if (cashIds.size === 0) {
      throw new Error(`В iiko нет поставщика «${CASH_SUPPLIER_NAME}»`);
    }

    const endpoint = `documents/export/incomingInvoice?from=${from}&to=${to}`;
    const invXml = await iikoGetText(endpoint, token, creds);
    if (invXml == null) throw new Error('iiko не отдал накладные');

    const parsed = await parseStringPromise(invXml, { explicitArray: true });
    const root = parsed?.incomingInvoiceDtoes;
    const docs: unknown[] = Array.isArray(root?.document) ? root.document : [];

    const out: IikoInvoice[] = [];
    for (const raw of docs) {
      const doc = raw as Record<string, unknown>;
      const supplier = first(doc.supplier).trim();
      if (!cashIds.has(supplier)) continue;
      const status = first(doc.status).trim();
      if (status === 'DELETED') continue;

      const date = (first(doc.incomingDate) || first(doc.dateIncoming)).slice(0, 10);
      const itemsRoot = (doc.items as Record<string, unknown>[] | undefined)?.[0] as Record<string, unknown> | undefined;
      const items: unknown[] = Array.isArray(itemsRoot?.item) ? (itemsRoot!.item as unknown[]) : [];
      const total = items.reduce((s: number, it) => s + num((it as Record<string, unknown>).sum), 0);

      out.push({
        docId: first(doc.id).trim(),
        supplier,
        date,
        total,
        document: first(doc.documentNumber).trim() || undefined,
      });
    }
    return out;
  }, creds);
}
