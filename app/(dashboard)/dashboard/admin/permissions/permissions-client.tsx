'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Section, canAccess } from '@/lib/access';
import { SectionGroup, ALL_CONFIGURABLE_SECTIONS } from '@/lib/permissions-catalog';
import { ROLE_LABELS } from '../users/users-client';

type AdminUser = {
  id: number;
  name: string;
  role: string;
  accessCode: string | null;
  tgId: number | null;
  filialIds: number[];
  permissions?: string[] | null;
};

export function PermissionsClient({
  initialUsers,
  catalog,
}: {
  initialUsers: AdminUser[];
  catalog: SectionGroup[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [users, setUsers] = useState<AdminUser[]>(initialUsers);

  // Выбираем пользователя из query параметра или первого из списка
  const initialUserId = useMemo(() => {
    const qId = Number(searchParams?.get('userId'));
    if (qId && initialUsers.some((u) => u.id === qId)) return qId;
    return initialUsers[0]?.id ?? 0;
  }, [searchParams, initialUsers]);

  const [selectedUserId, setSelectedUserId] = useState<number>(initialUserId);
  const [userSearch, setUserSearch] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null);

  const currentUser = users.find((u) => u.id === selectedUserId) || users[0];

  // Вычисляем дефолтные права роли для выбранного пользователя
  const roleDefaultSections = useMemo(() => {
    if (!currentUser) return new Set<Section>();
    return new Set<Section>(ALL_CONFIGURABLE_SECTIONS.filter((s) => canAccess(currentUser.role, s)));
  }, [currentUser]);

  // Вычисляем текущее состояние галочек (выборочные или дефолтные по роли)
  // localPermissions: null означает «стандартные по роли»
  const [localPermissions, setLocalPermissions] = useState<Section[] | null>(
    currentUser?.permissions ? (currentUser.permissions as Section[]) : null
  );

  // При смене пользователя обновляем локальный стейт
  function selectUser(id: number) {
    setSelectedUserId(id);
    const u = users.find((x) => x.id === id);
    setLocalPermissions(u?.permissions ? (u.permissions as Section[]) : null);
    setToast(null);
  }

  // Активный набор секций (для отображения галочек)
  const activeSections = useMemo(() => {
    if (localPermissions !== null) {
      return new Set<Section>(localPermissions);
    }
    return roleDefaultSections;
  }, [localPermissions, roleDefaultSections]);

  const isCustomMode = localPermissions !== null;

  // Проверка, есть ли несохранённые изменения
  const hasUnsavedChanges = useMemo(() => {
    if (!currentUser) return false;
    const original = currentUser.permissions ? (currentUser.permissions as Section[]) : null;
    if (original === null && localPermissions === null) return false;
    if (original === null && localPermissions !== null) return true;
    if (original !== null && localPermissions === null) return true;
    if (!original || !localPermissions) return false;
    if (original.length !== localPermissions.length) return true;
    const origSet = new Set(original);
    return localPermissions.some((s) => !origSet.has(s));
  }, [currentUser, localPermissions]);

  // Переключение одной секции
  function toggleSection(sectionId: Section) {
    setLocalPermissions((prev) => {
      const currentSet = new Set(prev !== null ? prev : roleDefaultSections);
      if (currentSet.has(sectionId)) {
        currentSet.delete(sectionId);
      } else {
        currentSet.add(sectionId);
      }
      return Array.from(currentSet);
    });
    setToast(null);
  }

  // Включить все в группе
  function selectAllInGroup(group: SectionGroup) {
    setLocalPermissions((prev) => {
      const currentSet = new Set(prev !== null ? prev : roleDefaultSections);
      for (const s of group.sections) {
        currentSet.add(s.id);
      }
      return Array.from(currentSet);
    });
    setToast(null);
  }

  // Отключить все в группе
  function deselectAllInGroup(group: SectionGroup) {
    setLocalPermissions((prev) => {
      const currentSet = new Set(prev !== null ? prev : roleDefaultSections);
      for (const s of group.sections) {
        currentSet.delete(s.id);
      }
      return Array.from(currentSet);
    });
    setToast(null);
  }

  // Быстрые пресеты
  function handleSelectAll() {
    setLocalPermissions([...ALL_CONFIGURABLE_SECTIONS]);
    setToast(null);
  }

  function handleDeselectAll() {
    setLocalPermissions([]);
    setToast(null);
  }

  function handlePresetWarehouse() {
    // Только Склад + Подтверждения (Inbox)
    const warehouseGroup = catalog.find((g) => g.id === 'warehouse');
    const warehouseSections = warehouseGroup ? warehouseGroup.sections.map((s) => s.id) : [];
    setLocalPermissions(Array.from(new Set<Section>([...warehouseSections, 'inbox' as Section])));
    setToast(null);
  }

  function handleResetToRole() {
    // Сбросить до стандартных прав роли (permissions = null)
    setLocalPermissions(null);
    setToast(null);
  }

  function handleRevertChanges() {
    setLocalPermissions(currentUser?.permissions ? (currentUser.permissions as Section[]) : null);
    setToast(null);
  }

  // Сохранение прав на сервере
  async function handleSave() {
    if (!currentUser) return;
    setToast(null);
    try {
      const res = await fetch('/api/admin/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          permissions: localPermissions,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setToast({ ok: false, message: data.error || 'Ошибка при сохранении' });
        return;
      }

      // Обновляем стейт пользователей локально
      setUsers((prev) =>
        prev.map((u) =>
          u.id === currentUser.id
            ? { ...u, permissions: localPermissions }
            : u
        )
      );

      setToast({
        ok: true,
        message: localPermissions === null
          ? `Права пользователя ${currentUser.name} сброшены до стандартных роли!`
          : `Права пользователя ${currentUser.name} успешно сохранены (${localPermissions.length} вкладок)!`,
      });

      startTransition(() => {
        router.refresh();
      });
    } catch (e) {
      setToast({ ok: false, message: e instanceof Error ? e.message : 'Сбой сети' });
    }
  }

  // Фильтр списка пользователей для поиска
  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        (ROLE_LABELS[u.role.split(':')[0]] || '').toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const baseRole = currentUser?.role.split(':')[0] || '';
  const roleLabel = ROLE_LABELS[baseRole] || baseRole;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 100 }}>
      {/* 1. Блок выбора пользователя */}
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
          <div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Выберите сотрудника для настройки:</span>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
              Права вступают в силу сразу после сохранения без перезахода в систему.
            </div>
          </div>
          <input
            type="text"
            className="input"
            placeholder="🔍 Поиск сотрудника..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            style={{ minWidth: 220, maxWidth: 300, height: 36, fontSize: 13 }}
          />
        </div>

        {/* Сетка пользователей */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 8,
            maxHeight: 260,
            overflowY: 'auto',
            padding: 4,
          }}
        >
          {filteredUsers.map((u) => {
            const isSelected = u.id === selectedUserId;
            const uRole = u.role.split(':')[0];
            const hasCustom = u.permissions && Array.isArray(u.permissions);
            return (
              <div
                key={u.id}
                onClick={() => selectUser(u.id)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                  background: isSelected ? 'var(--accent-soft)' : 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>
                    {u.name}
                  </span>
                  {hasCustom ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#fef3c7',
                        color: '#92400e',
                      }}
                    >
                      {u.permissions!.length} вкл.
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'var(--surface-muted)',
                        color: 'var(--text-faint)',
                      }}
                    >
                      роль
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {ROLE_LABELS[uRole] || uRole}
                </div>
              </div>
            );
          })}
          {filteredUsers.length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              Сотрудники не найдены
            </div>
          )}
        </div>
      </div>

      {currentUser && (
        <>
          {/* 2. Карточка текущего профиля и быстрые пресеты */}
          <div className="card" style={{ padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>{currentUser.name}</span>
                  <span
                    style={{
                      fontSize: 12,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--surface-muted)',
                      border: '1px solid var(--border-strong)',
                      color: 'var(--text)',
                      fontWeight: 500,
                    }}
                  >
                    {roleLabel}
                  </span>
                  {isCustomMode ? (
                    <span
                      style={{
                        fontSize: 12,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: '#fef3c7',
                        color: '#92400e',
                        fontWeight: 600,
                      }}
                    >
                      ⚠️ Выборочные права ({activeSections.size} из {ALL_CONFIGURABLE_SECTIONS.length})
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 12,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'var(--success-soft)',
                        color: 'var(--success)',
                        fontWeight: 600,
                      }}
                    >
                      ✓ Стандартные права роли ({activeSections.size} из {ALL_CONFIGURABLE_SECTIONS.length})
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {isCustomMode
                    ? 'Для этого сотрудника включен индивидуальный список вкладок. Вы можете редактировать любые галочки ниже.'
                    : 'Сотрудник использует стандартный набор вкладок своей роли. Любое изменение галочки включит индивидуальный режим.'}
                </div>
              </div>

              {/* Кнопки быстрых пресетов */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handlePresetWarehouse}
                  title="Оставить доступ только к складским операциям и подтверждениям"
                >
                  📦 Только Склад
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handleSelectAll}
                  title="Отметить все 30 разделов"
                >
                  ☑️ Выбрать всё
                </button>
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handleDeselectAll}
                  title="Снять все отметки"
                >
                  ⏹️ Снять всё
                </button>
                {isCustomMode && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    onClick={handleResetToRole}
                    style={{ color: 'var(--accent)', fontWeight: 600 }}
                    title="Вернуть стандартный набор прав для этой роли"
                  >
                    🔄 Сбросить до прав роли
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 3. Группы вкладок с чекбоксами */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {catalog.map((group) => {
              const totalInGroup = group.sections.length;
              const enabledInGroup = group.sections.filter((s) => activeSections.has(s.id)).length;
              const allEnabled = enabledInGroup === totalInGroup;
              const noneEnabled = enabledInGroup === 0;

              return (
                <div key={group.id} className="card" style={{ padding: 18 }}>
                  {/* Заголовок группы */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      paddingBottom: 12,
                      borderBottom: '1px solid var(--border)',
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 20 }}>{group.icon}</span>
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{group.title}</span>
                      <span
                        style={{
                          fontSize: 12,
                          padding: '2px 8px',
                          borderRadius: 12,
                          background: allEnabled ? 'var(--success-soft)' : noneEnabled ? 'var(--surface-muted)' : 'var(--accent-soft)',
                          color: allEnabled ? 'var(--success)' : noneEnabled ? 'var(--text-faint)' : 'var(--accent)',
                          fontWeight: 600,
                        }}
                      >
                        {enabledInGroup} из {totalInGroup}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() => selectAllInGroup(group)}
                        style={{ fontSize: 12 }}
                      >
                        Включить все
                      </button>
                      <button
                        type="button"
                        className="btn btn--sm btn--ghost"
                        onClick={() => deselectAllInGroup(group)}
                        style={{ fontSize: 12, color: 'var(--text-muted)' }}
                      >
                        Отключить все
                      </button>
                    </div>
                  </div>

                  {/* Список чекбоксов в группе */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
                      gap: 10,
                    }}
                  >
                    {group.sections.map((section) => {
                      const isChecked = activeSections.has(section.id);
                      return (
                        <label
                          key={section.id}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 12,
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: isChecked ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: isChecked ? 'var(--surface)' : 'var(--surface-muted)',
                            cursor: 'pointer',
                            userSelect: 'none',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSection(section.id)}
                            style={{
                              width: 18,
                              height: 18,
                              marginTop: 2,
                              accentColor: 'var(--accent)',
                              cursor: 'pointer',
                            }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ fontSize: 15 }}>{section.icon}</span>
                              <span style={{ fontWeight: 600, fontSize: 14, color: isChecked ? 'var(--text)' : 'var(--text-muted)' }}>
                                {section.title}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>
                              {section.description}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 4. Прилипающая панель сохранения внизу страницы */}
      {currentUser && (
        <div
          data-print-hide
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            background: 'var(--surface)',
            borderTop: '1px solid var(--border-strong)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.08)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>
              {currentUser.name}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Выбрано: <b>{activeSections.size}</b> из {ALL_CONFIGURABLE_SECTIONS.length} вкладок
            </span>
            {hasUnsavedChanges ? (
              <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                ● Есть несохранённые изменения
              </span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--success)', fontWeight: 500 }}>
                ✓ Сохранено
              </span>
            )}
            {toast && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: toast.ok ? 'var(--success)' : 'var(--danger)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  background: toast.ok ? 'var(--success-soft)' : '#fee2e2',
                }}
              >
                {toast.message}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hasUnsavedChanges && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={handleRevertChanges}
                disabled={isPending}
                style={{ fontSize: 13 }}
              >
                Отменить
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary"
              onClick={handleSave}
              disabled={isPending || (!hasUnsavedChanges && !toast)}
              style={{ padding: '8px 20px', fontWeight: 600 }}
            >
              {isPending ? 'Сохранение…' : 'Сохранить права'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
