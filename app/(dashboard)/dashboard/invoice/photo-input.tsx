'use client';

import { useRef, useState } from 'react';
import { compressImage } from './image';
import { PHOTO_LABELS, type PhotoKind } from '@/lib/storage';

export type Photo = { path: string; url: string; kind: PhotoKind };

async function upload(file: File, kind: PhotoKind): Promise<Photo> {
  // Отправляем оригинальный полный снимок без обрезки и искажений
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', file);
  const res = await fetch('/api/uploads', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.path) throw new Error(data.error || 'Не удалось загрузить фото');
  return { path: data.path, url: data.url, kind };
}

/** Файл в хранилище чистим следом; сирота не повод мешать оформлять приход. */
function forget(photo: Photo) {
  fetch(`/api/uploads/${photo.path}`, { method: 'DELETE' }).catch(() => {});
}

/**
 * Фотография одной позиции — доказательство, что этот товар действительно
 * привезли. Кнопка компактная и стоит прямо в строке: снимают по товару, пока
 * он в руках, а не собирают галерею в конце.
 */
export function ItemPhoto({ photo, onChange, disabled }: {
  photo: Photo | null;
  onChange: (p: Photo | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    setBusy(true);
    try {
      onChange(await upload(file, 'item'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="item-photo">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }}
      />
      {photo ? (
        <div className="item-photo__done">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt="Фото позиции" />
          <button
            type="button"
            className="btn btn--sm btn--danger"
            disabled={disabled}
            onClick={() => { forget(photo); onChange(null); }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--sm item-photo__btn"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          {busy ? '⏳' : '📷 фото товара'}
        </button>
      )}
      {error && <div className="item-photo__error">{error}</div>}
    </div>
  );
}

/**
 * Снимки накладной поставщика.
 *
 * Список, а не один слот: накладная часто на двух листах, и половина позиций
 * тогда осталась бы неподтверждённой. Без хотя бы одного снимка приход не
 * проводится — это проверяется и на сервере, клиент лишь объясняет заранее.
 */
export function InvoicePhotos({ photos, onChange, disabled }: {
  photos: Photo[];
  onChange: (p: Photo[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: File[]) {
    setError(null);
    setBusy(true);
    try {
      const added: Photo[] = [];
      for (const f of files) added.push(await upload(f, 'invoice'));
      onChange([...photos, ...added]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function remove(path: string) {
    const target = photos.find((p) => p.path === path);
    if (target) forget(target);
    onChange(photos.filter((p) => p.path !== path));
  }

  return (
    <div className="photo-slot">
      <div className="photo-slot__head">
        <span className="photo-slot__title">{PHOTO_LABELS.invoice}</span>
        <span className="photo-slot__hint">Бумага от поставщика — обязательно</span>
      </div>

      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p) => (
            <div key={p.path} className="photo-slot__preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={PHOTO_LABELS.invoice} />
              <button type="button" className="btn btn--danger btn--sm" onClick={() => remove(p.path)} disabled={disabled}>
                ✕ Убрать
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        // capture открывает сразу камеру на телефоне — снимать накладную
        // удобнее, чем искать её в галерее.
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => { const f = Array.from(e.target.files || []); if (f.length > 0) void pick(f); }}
      />
      <button
        type="button"
        className="btn photo-slot__btn"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
      >
        {busy ? '⏳ Загружаю…' : photos.length === 0 ? '📷 Снять накладную' : '📷 Добавить лист'}
      </button>

      {error && <div className="banner banner--error" style={{ marginTop: 8 }}>{error}</div>}
    </div>
  );
}
