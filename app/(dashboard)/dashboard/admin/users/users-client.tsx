'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copyable } from '@/components/copy-button';

type User = {
  id: number;
  name: string;
  role: string;
  accessCode: string | null;
  tgId: number | null;
  lastLoginAt: Date | string | null;
  filialIds: number[];
  passkeyCount: number;
  permissions?: string[] | null;
};

type Filial = { id: number; name: string };

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Администратор (admin)',
  director: 'Директор (director)',
  accountant: 'Бухгалтер (accountant)',
  manager: 'Менеджер (manager)',
  cashier: 'Кассир (cashier)',
  kitchen: 'Кухня (kitchen)',
  prep_chef: 'Заготовщик (prep_chef)',
  bar: 'Бар (bar)',
  supplier: 'Снабженец (supplier)',
  hall: 'Зал (hall)',
};

const ROLES = [
  'admin',
  'director',
  'accountant',
  'manager',
  'cashier',
  'kitchen',
  'prep_chef',
  'bar',
  'supplier',
  'hall',
];

export function UsersClient({ users, filials, currentUserId }: { users: User[]; filials: Filial[]; currentUserId: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filteredUsers = q
    ? users.filter((u) => u.name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q) || (u.accessCode || '').includes(q))
    : users;

  async function save(form: {
    id?: number;
    name: string;
    role: string;
    accessCode: string;
    tgId: string;
    filialIds: number[];
  }) {
    const body = {
      id: form.id,
      name: form.name,
      role: form.role,
      accessCode: form.accessCode || null,
      // ⚠️ Пустое поле — это «не менять», а не «стереть»: `tg_id` в базе NOT
      // NULL, и попытка записать туда null роняла сохранение целиком. Так у
      // сотрудника с `tg_id = 0` не сохранялся даже филиал.
      tgId: form.tgId.trim() === '' ? undefined : Number(form.tgId),
      filialIds: form.filialIds,
    };
    const res = await fetch('/api/admin/users', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    // ⚠️ На 500 Next отдаёт не JSON, и `res.json()` тут падал молча: кнопка
    // «Сохранить» просто ничего не делала, а причина не показывалась нигде.
    const data = await res.json().catch(() => ({} as { error?: string }));
    if (!res.ok) return alert(data.error || `Не удалось сохранить (${res.status})`);
    setEditing(null);
    router.refresh();
  }

  async function del(id: number) {
    if (!confirm('Удалить пользователя?')) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'Ошибка');
    router.refresh();
  }

  return (
    <div className="grid">
      {editing === 'new' ? (
        <UserForm filials={filials} onSubmit={save} onCancel={() => setEditing(null)} />
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
            + Добавить пользователя
          </button>
          <input className="input" placeholder="Поиск по имени, роли или коду…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filteredUsers.length} из {users.length}</span>
        </div>
      )}

      {/* ⚠️ Не таблица. Семь колонок не помещались на телефон, и страницу
          приходилось листать вбок — по отзыву это самое неприятное место в
          интерфейсе. Карточка показывает то же самое и сама переносится. */}
      <div className="user-list">
        {filteredUsers.map((u) => (
          editing === u.id ? (
            <UserForm key={u.id} initial={u} filials={filials} onSubmit={save} onCancel={() => setEditing(null)} />
          ) : (
            <div key={u.id} className="user-card">
              <div className="user-card__top">
                <div className="user-card__name">
                  {u.name}
                  {u.id === currentUserId && <span className="user-card__you">вы</span>}
                </div>
                <div className="user-card__buttons">
                  <Link
                    href={`/dashboard/admin/permissions?userId=${u.id}`}
                    className="btn btn--sm"
                    title="Настроить права доступа"
                    style={{ fontSize: 12, padding: '4px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    🔐 Права
                  </Link>
                  <button type="button" className="btn btn--sm" onClick={() => setEditing(u.id)}>✎</button>
                  {u.id !== currentUserId && (
                    <button type="button" className="btn btn--sm btn--danger" onClick={() => del(u.id)}>×</button>
                  )}
                </div>
              </div>

              <div className="user-card__rows">
                <div><span>Роль</span><b>{ROLE_LABELS[u.role.split(':')[0]] || u.role.split(':')[0]}</b></div>
                <div>
                  <span>Филиалы</span>
                  <b>
                    {u.filialIds.length === 0
                      ? <em style={{ color: 'var(--warning)', fontStyle: 'normal' }}>не назначены</em>
                      : u.filialIds.map((fid) => filials.find((f) => f.id === fid)?.name || fid).join(', ')}
                  </b>
                </div>
                <div>
                  <span>Права</span>
                  <b>
                    {u.permissions && Array.isArray(u.permissions) ? (
                      <span style={{ color: '#b45309' }}>Выборочные ({u.permissions.length})</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>По роли</span>
                    )}
                  </b>
                </div>
                <div><span>Код</span><b>{u.accessCode ? <Copyable value={u.accessCode} /> : '—'}</b></div>
                <div><span>Passkey</span><b>{u.passkeyCount || '—'}</b></div>
                <div><span>Вход</span><b>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString('ru-RU') : '—'}</b></div>
              </div>
            </div>
          )
        ))}
        {filteredUsers.length === 0 && <div className="card"><div className="empty-state">Пользователей нет</div></div>}
      </div>
    </div>
  );
}

function UserForm({ initial, filials, onSubmit, onCancel }: {
  initial?: User;
  filials: Filial[];
  onSubmit: (f: { id?: number; name: string; role: string; accessCode: string; tgId: string; filialIds: number[] }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || 'cashier');
  const [accessCode, setAccessCode] = useState(initial?.accessCode || '');
  // Ноль — реальный id в этой базе, поэтому сравниваем с null, а не по
  // «правдивости»: иначе поле показывалось пустым и затирало значение.
  const [tgId, setTgId] = useState(initial?.tgId != null ? String(initial.tgId) : '');
  const [filialIds, setFilialIds] = useState<number[]>(initial?.filialIds || []);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit({ id: initial?.id, name, role, accessCode, tgId, filialIds });
    } finally {
      setBusy(false);
    }
  }

  function toggleFilial(id: number) {
    setFilialIds((arr) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]));
  }

  return (
    <form onSubmit={submit} className="card" style={{ background: 'var(--surface-muted)', borderStyle: 'dashed' }}>
      <div className="card__title">
        <span className="card__title-text">{initial ? `✎ Редактирование: ${initial.name}` : '➕ Новый пользователь'}</span>
      </div>
      <div className="grid grid--2">
        <div className="field">
          <label className="field__label">Имя *</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label className="field__label">Роль</label>
          <select className="select" value={role.split(':')[0]} onChange={(e) => setRole(e.target.value + (role.includes(':') ? ':' + role.split(':')[1] : ''))}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field__label">Код доступа</label>
          <input className="input" value={accessCode} onChange={(e) => setAccessCode(e.target.value)} placeholder="мин. 4 символа" />
        </div>
        <div className="field">
          <label className="field__label">Telegram ID</label>
          <input className="input" type="number" value={tgId} onChange={(e) => setTgId(e.target.value)} placeholder="опционально" />
        </div>
      </div>
      <div className="field" style={{ marginTop: 12 }}>
        <label className="field__label">Доступные филиалы</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {filials.map((f) => (
            <label key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid var(--border-strong)', borderRadius: 8, background: filialIds.includes(f.id) ? 'var(--accent)' : 'var(--surface)', color: filialIds.includes(f.id) ? '#fff' : 'var(--text)', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={filialIds.includes(f.id)} onChange={() => toggleFilial(f.id)} style={{ display: 'none' }} />
              {f.name}
            </label>
          ))}
          {filials.length === 0 && <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>Сначала создай филиал</span>}
        </div>
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button type="submit" className="btn btn--primary" disabled={busy || !name}>{busy ? 'Сохранение…' : 'Сохранить'}</button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Отмена</button>
      </div>
    </form>
  );
}
