'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InvoicePhotos, ItemPhoto, type Photo } from './photo-input';
import { StoreSelect } from '@/components/store-select';
import { SupplierSelect } from '@/components/supplier-select';
import { formatDraftTime, useDraft } from '@/lib/use-draft';
import {
  CATEGORY_ICONS,
  getProductNaturalCategory,
  isPfProduct,
} from '@/lib/warehouse-categories';

type Product = {
  id: string;
  name: string;
  num: string;
  mainUnit: string;
  type?: string;
  category?: string;
};

export type InvoiceItem = {
  rowId: string;
  product_id: string;
  product_name: string;
  unit: string;
  category?: string;
  quantity: number;
  price: number;
  sum: number;
  photo?: Photo | null;
  pack_note?: string;
};

type DraftData = {
  supplierId: string;
  supplierName: string;
  storeId: string;
  storeName: string;
  comment: string;
  items: InvoiceItem[];
};

function generateRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `row_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function InvoiceClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [storeId, setStoreId] = useState('');
  const [storeName, setStoreName] = useState('');
  const [comment, setComment] = useState('');
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const [invoicePhotos, setInvoicePhotos] = useState<Photo[]>([]);

  const [addQuery, setAddQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Все');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Черновик формы в localStorage — защищает от случайного закрытия вкладки или звонка
  const draftValue = useMemo<DraftData>(
    () => ({ supplierId, supplierName, storeId, storeName, comment, items }),
    [supplierId, supplierName, storeId, storeName, comment, items]
  );

  const restoreDraft = useCallback((d: DraftData) => {
    setSupplierId(d.supplierId || '');
    setSupplierName(d.supplierName || '');
    setStoreId(d.storeId || '');
    setStoreName(d.storeName || '');
    setComment(d.comment || '');
    setItems(Array.isArray(d.items) ? d.items : []);
  }, []);

  const draft = useDraft<DraftData>({
    name: 'invoice',
    scope: storeId || 'general',
    value: draftValue,
    isEmpty: (v) => v.items.length === 0 && !v.supplierId && !v.comment,
    onRestore: restoreDraft,
  });

  useEffect(() => {
    (async () => {
      setLoadingProducts(true);
      try {
        const res = await fetch('/api/iiko/products');
        const data = await res.json();
        const rawProducts: Product[] = data.products || [];
        // Фильтруем внутренние полуфабрикаты кухни (ПФ / PREPARED)
        const goods = rawProducts
          .filter((p) => !isPfProduct(p))
          .map((p) => ({
            ...p,
            category: getProductNaturalCategory(p),
          }));
        setProducts(goods);
      } catch {
        // ignore — список нужен для поиска товаров
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, []);

  // Категории с подсчётом доступных товаров
  const { categoriesList, categoryCounts } = useMemo(() => {
    const counts: Record<string, number> = { 'Все': products.length };
    products.forEach((p) => {
      const cat = p.category || 'Прочее';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const list = Object.keys(counts).filter((cat) => cat !== 'Все' && counts[cat] > 0);
    list.sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return { categoriesList: ['Все', ...list], categoryCounts: counts };
  }, [products]);

  // Подсчёт количества вхождений каждого товара в накладную
  const productItemCounts = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((it) => {
      counts.set(it.product_id, (counts.get(it.product_id) || 0) + 1);
    });
    return counts;
  }, [items]);

  // Фильтрация товаров по поиску и категории
  const searchResults = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    let list = products;
    if (selectedCategory !== 'Все') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (!q) {
      return selectedCategory === 'Все' ? [] : list.slice(0, 30);
    }
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 40);
  }, [addQuery, selectedCategory, products]);

  // Общий итог суммы
  const totalSum = useMemo(() => items.reduce((s, it) => s + (it.sum || 0), 0), [items]);

  // Позиции без прикрепленного фото
  const itemsWithoutPhoto = useMemo(() => items.filter((it) => !it.photo), [items]);

  // Уникальные товары в накладной
  const uniqueProductsCount = useMemo(() => new Set(items.map((it) => it.product_id)).size, [items]);

  const canSend =
    Boolean(supplierId) &&
    Boolean(storeId) &&
    items.length > 0 &&
    items.every((it) => it.product_id && it.quantity > 0) &&
    invoicePhotos.length > 0;

  function updateItem(rowId: string, patch: Partial<InvoiceItem>) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.rowId !== rowId) return it;
        const updated = { ...it, ...patch };

        // Умный двусторонний пересчет:
        // 1. Если изменено количество или цена -> обновляем сумму
        if ('quantity' in patch || 'price' in patch) {
          updated.sum = Math.round(updated.quantity * updated.price);
        }
        // 2. Если напрямую изменена сумма (например из накладной) -> пересчитываем цену за ед.
        else if ('sum' in patch) {
          updated.price = updated.quantity > 0 ? Math.round(updated.sum / updated.quantity) : 0;
        }

        return updated;
      })
    );
  }

  function removeItem(rowId: string) {
    setItems((prev) => prev.filter((it) => it.rowId !== rowId));
  }

  function duplicateItem(it: InvoiceItem) {
    const newItem: InvoiceItem = {
      ...it,
      rowId: generateRowId(),
      photo: null, // У новой партии/строки должно быть своё фото
    };
    setItems((prev) => [...prev, newItem]);
  }

  function addProduct(p: Product) {
    const newItem: InvoiceItem = {
      rowId: generateRowId(),
      product_id: p.id,
      product_name: p.name,
      unit: p.mainUnit,
      category: p.category,
      quantity: 0,
      price: 0,
      sum: 0,
      photo: null,
    };
    setItems((prev) => [...prev, newItem]);
  }

  function clearAll() {
    if (items.length > 0 && !confirm('Очистить все набранные позиции?')) return;
    setItems([]);
    setComment('');
    setInvoicePhotos([]);
    draft.clear();
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      const photos = [
        ...invoicePhotos.map((p) => ({ path: p.path, kind: 'invoice' as const })),
        ...items.flatMap((it) =>
          it.photo
            ? [
                {
                  path: it.photo.path,
                  kind: 'item' as const,
                  product_id: it.product_id,
                  product_name: it.product_name,
                },
              ]
            : []
        ),
      ];

      const res = await fetch('/api/iiko/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId,
          supplier_name: supplierName,
          store_id: storeId,
          store_name: storeName,
          items: items.map(({ photo: _photo, ...it }) => it),
          comment,
          photos,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setMsg({ ok: false, text: data.error || `Ошибка ${res.status}` });
      } else {
        setMsg({
          ok: true,
          text: data.tg_sent
            ? `Создан документ ${data.documentNumber}. Фотоотчёт ушёл в Telegram.`
            : `Создан документ ${data.documentNumber}. ⚠️ Фотоотчёт в Telegram не ушёл — фотографии сохранены, отправятся со сводкой.`,
        });
        setItems([]);
        setComment('');
        setInvoicePhotos([]);
        draft.clear();
      }
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Ошибка сети' });
    } finally {
      setBusy(false);
    }
  }

  // Для подсчёта порядкового номера строки одинакового товара (#1, #2...)
  const productRowIndices = useMemo(() => {
    const indices = new Map<string, number>();
    const productCurrentIndex = new Map<string, number>();

    items.forEach((it) => {
      const current = (productCurrentIndex.get(it.product_id) || 0) + 1;
      productCurrentIndex.set(it.product_id, current);
      indices.set(it.rowId, current);
    });

    return indices;
  }, [items]);

  return (
    <div className="grid">
      {draft.restoredAt && (
        <div className="banner banner--info draft-banner" style={{ display: 'flex' }}>
          <span>Восстановлен черновик прихода от {formatDraftTime(draft.restoredAt)}.</span>
          <button type="button" className="btn btn--sm" onClick={clearAll}>
            Очистить
          </button>
        </div>
      )}

      {/* 1. Поставщик и склад */}
      <section className="card">
        <div className="card__title">
          <span className="card__title-text">🚚 Поставщик и склад</span>
        </div>
        <div className="grid grid--2">
          <SupplierSelect
            value={supplierId}
            onChange={(id, name) => {
              setSupplierId(id);
              setSupplierName(name);
            }}
          />
          <StoreSelect
            label="Склад поступления"
            value={storeId}
            onChange={(id, name) => {
              setStoreId(id);
              setStoreName(name);
            }}
          />
        </div>
      </section>

      {/* 2. Фото накладной */}
      <section className="card">
        <div className="card__title">
          <span className="card__title-text">📄 Снимок бумажной накладной</span>
        </div>
        <InvoicePhotos photos={invoicePhotos} onChange={setInvoicePhotos} disabled={busy} />
        {invoicePhotos.length === 0 && (
          <div className="banner banner--warn" style={{ marginTop: 10 }}>
            Без снимка накладной приход не проводится. Снимите лист целиком, чтобы читались позиции и суммы.
          </div>
        )}
      </section>

      {/* 3. Выбор товаров */}
      <section className="card">
        <div className="card__title">
          <span className="card__title-text">🔍 Добавить товары в накладную</span>
          {loadingProducts && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Загрузка каталога…</span>}
        </div>

        {/* Быстрые фильтры по категориям */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            overflowX: 'auto',
            paddingBottom: 8,
            marginBottom: 10,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {categoriesList.map((cat) => {
            const count = categoryCounts[cat] || 0;
            const icon = CATEGORY_ICONS[cat] || '📦';
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className="btn btn--sm"
                style={{
                  background: isActive ? 'var(--accent)' : 'var(--surface-muted)',
                  color: isActive ? '#fff' : 'var(--text)',
                  borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                  whiteSpace: 'nowrap',
                  fontSize: 12,
                  padding: '4px 10px',
                  borderRadius: 999,
                  flexShrink: 0,
                }}
              >
                <span>{icon}</span>
                <span>{cat}</span>
                <span style={{ opacity: 0.7, fontSize: 11 }}>({count})</span>
              </button>
            );
          })}
        </div>

        {/* Поле поиска */}
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            placeholder="Поиск товара по названию (например, молоко, картофель, сыр)..."
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
          />
          {addQuery && (
            <button
              type="button"
              onClick={() => setAddQuery('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-faint)',
                fontSize: 16,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Результаты поиска / каталог */}
        {searchResults.length > 0 && (
          <div
            style={{
              marginTop: 10,
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              maxHeight: 280,
              overflowY: 'auto',
              background: 'var(--surface)',
            }}
          >
            {searchResults.map((p, idx) => {
              const countInInvoice = productItemCounts.get(p.id) || 0;
              const alreadyAdded = countInInvoice > 0;
              const icon = CATEGORY_ICONS[p.category || 'Прочее'] || '📦';

              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderBottom: idx < searchResults.length - 1 ? '1px solid var(--border)' : 'none',
                    background: alreadyAdded ? 'var(--accent-soft)' : 'transparent',
                    gap: 10,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                        {p.name}
                      </span>
                      {alreadyAdded && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--accent)',
                            background: 'var(--surface)',
                            border: '1px solid var(--accent)',
                            padding: '1px 6px',
                            borderRadius: 6,
                          }}
                        >
                          {countInInvoice} в накл.
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 6 }}>
                      <span>{p.category}</span>
                      <span>·</span>
                      <span>Ед: <b>{p.mainUnit}</b></span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="btn btn--sm"
                    style={{
                      background: alreadyAdded ? 'var(--accent)' : 'var(--surface-muted)',
                      color: alreadyAdded ? '#fff' : 'var(--text)',
                      flexShrink: 0,
                      fontWeight: 600,
                      fontSize: 12,
                      padding: '5px 12px',
                    }}
                  >
                    {alreadyAdded ? '➕ Ещё' : '➕ Добавить'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Таблица позиций накладной */}
      <section className="card">
        <div className="card__title">
          <div className="card__title-text">
            <span>📦 Позиции в приходе ({items.length})</span>
            {uniqueProductsCount > 0 && uniqueProductsCount !== items.length && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                (уникальных товаров: {uniqueProductsCount})
              </span>
            )}
          </div>
          {items.length > 0 && (
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>
              Итого: {totalSum.toLocaleString('ru-RU')} сум
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 12px', textAlign: 'center' }}>
            Позиции пока не добавлены. Найдите нужные товары выше и нажмите «Добавить».
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
              <thead>
                <tr style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', background: 'var(--surface-muted)' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Товар и фото</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: 120 }}>Кол-во</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: 130 }}>Цена за ед.</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right', width: 140 }}>Сумма</th>
                  <th style={{ padding: '10px 8px', textAlign: 'center', width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const totalOfThisProduct = productItemCounts.get(it.product_id) || 1;
                  const rowIndex = productRowIndices.get(it.rowId) || 1;
                  const hasMultiple = totalOfThisProduct > 1;

                  return (
                    <tr key={it.rowId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                            {it.product_name}
                          </span>
                          <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>
                            ({it.unit})
                          </span>
                          {hasMultiple && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'var(--accent)',
                                background: 'var(--accent-soft)',
                                padding: '1px 5px',
                                borderRadius: 4,
                              }}
                              title={`Позиция №${rowIndex} из ${totalOfThisProduct}`}
                            >
                              строка #{rowIndex}
                            </span>
                          )}
                        </div>

                        {/* Фасовка / Заметка */}
                        <div style={{ marginTop: 4 }}>
                          <input
                            type="text"
                            placeholder="Фасовка/заметка (напр. коробка 5 кг)..."
                            value={it.pack_note || ''}
                            onChange={(e) => updateItem(it.rowId, { pack_note: e.target.value })}
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              background: 'transparent',
                              border: '1px dashed var(--border)',
                              borderRadius: 4,
                              color: 'var(--text-muted)',
                              width: '100%',
                              maxWidth: 240,
                            }}
                          />
                        </div>

                        {/* Фото подтверждение */}
                        <ItemPhoto
                          photo={it.photo || null}
                          onChange={(p) => updateItem(it.rowId, { photo: p })}
                          disabled={busy}
                        />
                      </td>

                      {/* Количество */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="0.001"
                          className="input input--inline input--number"
                          value={it.quantity || ''}
                          onChange={(e) =>
                            updateItem(it.rowId, { quantity: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0"
                        />
                      </td>

                      {/* Цена */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="1"
                          className="input input--inline input--number"
                          value={it.price || ''}
                          onChange={(e) =>
                            updateItem(it.rowId, { price: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0"
                        />
                      </td>

                      {/* Сумма (двусторонний ввод) */}
                      <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="1"
                          className="input input--inline input--number"
                          value={it.sum || ''}
                          onChange={(e) =>
                            updateItem(it.rowId, { sum: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0"
                          title="Можно ввести сумму напрямую — цена за ед. пересчитается сама"
                        />
                      </td>

                      {/* Действия: Дублировать и Удалить */}
                      <td style={{ padding: '10px 8px', verticalAlign: 'top', textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <button
                            type="button"
                            className="btn btn--sm"
                            style={{ padding: '3px 6px', fontSize: 12, minHeight: 28 }}
                            onClick={() => duplicateItem(it)}
                            title="Добавить ещё строку этого товара"
                          >
                            ➕
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--icon"
                            style={{ padding: '3px 6px', fontSize: 13, minHeight: 28, width: 28 }}
                            onClick={() => removeItem(it.rowId)}
                            title="Удалить позицию"
                          >
                            ✕
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)', fontWeight: 700, background: 'var(--surface-muted)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    Итого строк: {items.length} (товаров: {uniqueProductsCount})
                  </td>
                  <td colSpan={2} style={{ padding: '10px 12px', textAlign: 'right' }}>
                    Общая сумма:
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--accent)', fontSize: 14 }}>
                    {totalSum.toLocaleString('ru-RU')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {items.length > 0 && itemsWithoutPhoto.length > 0 && (
          <div className="banner banner--warn" style={{ marginTop: 12 }}>
            ⚠️ Внимание: у некоторых позиций нет фотографии товара ({itemsWithoutPhoto.length} шт.). Приход проведётся, но в Telegram-отчёте будет указано, что подтверждение отсутствует.
          </div>
        )}
      </section>

      {/* 5. Комментарий */}
      <section className="card">
        <div className="field">
          <label className="field__label">Комментарий к приходу</label>
          <textarea
            className="textarea"
            rows={2}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Номер накладной, особенности поставки, примечания (опционально)..."
          />
        </div>
      </section>

      {/* 6. Панель действий */}
      <div className="action-bar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {msg && (
          <div className={`banner ${msg.ok ? 'banner--success' : 'banner--error'}`} style={{ flex: 1, minWidth: 260 }}>
            {msg.text}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {items.length > 0 && (
            <button type="button" className="btn btn--ghost" onClick={clearAll} disabled={busy}>
              Очистить
            </button>
          )}
          <button type="button" className="btn btn--primary" onClick={submit} disabled={!canSend || busy}>
            {busy ? 'Создание…' : `Создать приход (${totalSum.toLocaleString('ru-RU')} сум)`}
          </button>
        </div>
      </div>
    </div>
  );
}
