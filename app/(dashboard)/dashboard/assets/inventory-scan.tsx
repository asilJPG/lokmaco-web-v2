'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Asset, AssetLocation, AssetTag } from '@/db/schema';
import { looksLikeTag, normalizeTagCode } from '@/lib/asset-tags';
import { baseInvNumber, unitLabel } from '@/lib/inv-number';

type Feedback = {
  tone: 'ok' | 'dup' | 'bad';
  code: string;
  title: string;
  /** «в обходе 4 из 20» — прогресс именно по этой партии. */
  progress?: string;
  sub?: string;
  unbound?: boolean;
  /**
   * Судьба записи на сервере. Привязка показывается сразу (рука уже тянется к
   * следующей наклейке), но «сохранено» должно означать именно сохранено:
   * наклейка уже на предмете, и незаписанная привязка обнаружится только на
   * следующей инвентаризации.
   */
  state?: 'saving' | 'saved' | 'failed';
};

/**
 * `info` — просто посмотреть, что это за предмет: скан ничего не записывает,
 * ни в обход, ни в наклейки. Нужен чаще всего: «а это что за стол и чей он».
 */
type Mode = 'audit' | 'bind' | 'info';

/** Партия: 20 одинаковых столов — один вид и двадцать экземпляров. */
type Batch = { key: string; name: string; units: Asset[] };

function buildBatches(assets: Asset[]): Batch[] {
  const map = new Map<string, Batch>();
  for (const a of assets) {
    const key = `${baseInvNumber(a.invNumber)}|${a.name}`;
    if (!map.has(key)) map.set(key, { key, name: a.name, units: [] });
    map.get(key)!.units.push(a);
  }
  for (const b of map.values()) {
    b.units.sort((x, y) => String(x.invNumber).localeCompare(String(y.invNumber)));
  }
  return Array.from(map.values());
}

/**
 * Камера в двух режимах: обход инвентаризации и оклейка наклейками.
 *
 * Режимы разделены намеренно. При обходе скан **засчитывает** предмет, при
 * оклейке — **привязывает** наклейку к следующему свободному экземпляру. Одно
 * действие камерой не может значить и то и другое: перепутав, человек либо
 * переклеит учёт, либо не досчитается половины зала.
 *
 * Сканируем в браузере телефона, без отдельного приложения — обход и оклейку
 * делают с того, что уже в кармане.
 */
export function InventoryScanModal({
  initialMode = 'audit', targetUnitId, assets, tags, locations, onFinish, onBound, onClose,
}: {
  initialMode?: Mode;
  /**
   * Конкретный экземпляр, к которому клеим. Приходит из списка ОС: там
   * выбирают предмет глазами («вот эта морозилка»), а камера нужна только
   * чтобы прочитать код наклейки. Без него камера сама берёт следующий
   * свободный экземпляр выбранной партии.
   */
  targetUnitId?: string;
  assets: Asset[];
  tags: AssetTag[];
  locations: AssetLocation[];
  onFinish: (auditId: string, ids: string[]) => Promise<void>;
  onBound: () => Promise<void>;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [placeId, setPlaceId] = useState('all');
  const [scannedIds, setScannedIds] = useState<Set<string>>(new Set());
  const [last, setLast] = useState<Feedback | null>(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);
  const [showMissing, setShowMissing] = useState(false);
  const [manual, setManual] = useState('');
  const [saving, setSaving] = useState(false);
  const [binding, setBinding] = useState<string | null>(null);
  const [audit, setAudit] = useState<{ id: string; locationId: string | null } | null>(null);
  /**
   * Какая камера снимает. Задняя по умолчанию — ей и сканируют. Фронтальная
   * нужна, когда наклейка в неудобном месте: её видно на экране, пока тянешься
   * рукой за шкаф. Переключение пересоздаёт поток, поэтому эффект камеры от
   * этого состояния и зависит.
   */
  /**
   * Оклейка одного предмета: пришли из списка, значит выбор уже сделан.
   * Экран тогда — только камера: ни ленты выбора, ни переключателя режимов,
   * ни списка экземпляров. Это единственный способ попасть в оклейку.
   */
  const single = Boolean(targetUnitId);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  /** Карточка предмета в режиме «что это». */
  const [info, setInfo] = useState<Asset | null>(null);
  /**
   * Что происходит с камерой — словами, прямо на экране.
   *
   * ⚠️ Раньше отказ камеры был **невидим**: сообщение показывалось только
   * когда браузер вовсе не умеет getUserMedia, а самый частый случай —
   * «доступ к камере запрещён» — оставлял чёрный прямоугольник без единого
   * слова. Выглядело как «сканер не работает», и понять причину было нельзя.
   */
  const [diag, setDiag] = useState<{ engine: string; size: string; frames: number } | null>(null);
  /** Счётчик попыток: меняется по кнопке «Повторить» и перезапускает камеру. */
  const [retry, setRetry] = useState(0);
  const [hasTorch, setHasTorch] = useState(false);
  const [starting, setStarting] = useState(false);

  /** Что клеим: партия того экземпляра, ради которого открыли камеру. */
  const batchKey = useMemo(() => {
    const a = targetUnitId ? assets.find((x) => x.id === targetUnitId) : null;
    return a ? `${baseInvNumber(a.invNumber)}|${a.name}` : '';
  }, [targetUnitId, assets]);

  /**
   * Экземпляр, на который уйдёт наклейка. Снимается после привязки — чтобы
   * второй скан подряд (например, случайный) не уехал на тот же предмет.
   */
  const [pinnedId, setPinnedId] = useState<string | null>(targetUnitId ?? null);

  /** Зелёная вспышка поверх кадра: видно, не глядя в текст. */
  const [flash, setFlash] = useState(0);

  /**
   * Наклейки держим в своём состоянии, а не только в пропсах: при оклейке они
   * меняются каждые несколько секунд, и перезагружать весь список ОС после
   * каждой наклейки — значит клеить двадцать штук полчаса.
   */
  const [tagList, setTagList] = useState<AssetTag[]>(tags);
  useEffect(() => { setTagList(tags); }, [tags]);

  // ⚠️ Зеркала состояния для обработчика сканов. Камера может вернуть два кода
  // в одном кадре, а привязка ещё и уходит на сервер — оба обработчика успеют
  // отработать до перерисовки и прочитают устаревшее состояние: второй скан
  // потеряет первый, а две наклейки уедут на один и тот же экземпляр.
  const scannedRef = useRef(scannedIds);
  scannedRef.current = scannedIds;
  const tagListRef = useRef(tagList);
  tagListRef.current = tagList;

  const batches = useMemo(() => buildBatches(assets), [assets]);
  const batch = batches.find((b) => b.key === batchKey);

  const activePlace = audit ? (audit.locationId || 'all') : placeId;
  const scope = useMemo(
    () => (activePlace === 'all' ? assets : assets.filter((a) => a.locationId === activePlace)),
    [assets, activePlace]
  );

  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  const byInv = useMemo(() => {
    const m = new Map<string, Asset>();
    for (const a of assets) if (a.invNumber) m.set(a.invNumber.trim().toUpperCase(), a);
    return m;
  }, [assets]);
  const tagByCode = useMemo(() => new Map(tagList.map((t) => [t.code, t])), [tagList]);
  const tagByAsset = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tagList) if (t.assetId) m.set(t.assetId, t.code);
    return m;
  }, [tagList]);
  const placeName = useMemo(() => new Map(locations.map((l) => [l.id, l.name])), [locations]);

  /** Наклейки по экземплярам — на момент последнего скана, а не рендера. */
  function boundNow(): Map<string, string> {
    const m = new Map<string, string>();
    for (const t of tagListRef.current) if (t.assetId) m.set(t.assetId, t.code);
    return m;
  }

  /** Сколько экземпляров партии уже оклеено — «7 из 20». */
  function boundCount(b: Batch): number {
    return b.units.filter((u) => tagByAsset.has(u.id)).length;
  }

  /**
   * В обходе встречаются оба вида QR: универсальная наклейка (ссылка вида
   * `/tag/LKM-0007`) и старый стикер с инвентарным номером в тексте.
   */
  function resolve(raw: string): { asset: Asset | null; code: string; unbound?: boolean } | null {
    const code = normalizeTagCode(raw);
    if (code && tagByCode.get(code)?.assetId) {
      const asset = byId.get(tagByCode.get(code)!.assetId!);
      if (asset) return { asset, code };
    }
    // Наклейка наша, но ни к чему не привязана — это не «не найдено»,
    // а «её ещё не оформили», и человеку это надо сказать прямо.
    if (code && looksLikeTag(raw)) return { asset: null, code, unbound: true };

    // ⚠️ Стикер конкретного предмета (кнопка 🏷) несёт ссылку с **инвентарным
    // номером**: `…/tag/INV-INV-2147`. Раньше из ссылки доставали только коды
    // наклеек `LKM-*`, а остальное проваливалось в разбор голого текста — и
    // ссылка там не проходила проверку на «номер без лишних символов». Скан
    // такого стикера **молча игнорировался**: камера светила, счётчик кадров
    // рос, на экране не появлялось ничего (поймано 05.09.2026 на живом
    // стикере «Бойлер Silverinox»).
    if (code && byInv.has(code)) return { asset: byInv.get(code)!, code };

    const text = String(raw || '');
    const m = text.match(/Инв\.\s*№\s*[:：]?\s*([A-Za-zА-Яа-я0-9\-_]+)/i);
    const inv = m ? m[1].trim().toUpperCase() : (/^[A-Z0-9\-_]{3,}$/i.test(text.trim()) ? text.trim().toUpperCase() : null);
    if (inv) return { asset: byInv.get(inv) || null, code: inv };

    // ⚠️ Молчать нельзя. Непонятный QR (чужая наклейка, реклама на стене)
    // должен сказать о себе: иначе сканер выглядит сломанным ровно так же,
    // как при настоящей поломке.
    if (code) return { asset: null, code };
    const shown = text.trim().slice(0, 40);
    return shown ? { asset: null, code: shown } : null;
  }

  function buzz(pattern: number | number[]) {
    // Единственная обратная связь, когда телефон в вытянутой руке и на экран
    // не смотришь. Ошибка и повтор отличаются ритмом.
    if (navigator.vibrate) navigator.vibrate(pattern);
  }

  /** Обход: скан засчитывает предмет. */
  function registerAudit(raw: string) {
    const hit = resolve(raw);
    if (!hit) return;

    if (hit.unbound) {
      setLast({ tone: 'bad', code: hit.code, title: 'Наклейка ни к чему не привязана', unbound: true });
      buzz([120]);
      return;
    }
    if (!hit.asset) {
      setLast({ tone: 'bad', code: hit.code, title: 'Не найдено в базе' });
      buzz([120]);
      return;
    }

    const asset = hit.asset;
    const already = scannedRef.current.has(asset.id);
    const next = new Set(scannedRef.current);
    if (!already) next.add(asset.id);
    scannedRef.current = next;
    setScannedIds(next);

    // ⚠️ Прогресс по партии — то, ради чего всё и затевалось: «отсканил 1 из
    // 20». Общий счётчик по залу на этот вопрос не отвечает.
    const b = batches.find((x) => x.key === `${baseInvNumber(asset.invNumber)}|${asset.name}`);
    const inBatch = b ? b.units.filter((u) => next.has(u.id)).length : 0;

    setLast({
      tone: already ? 'dup' : 'ok',
      code: hit.code,
      title: `${asset.name}${unitLabel(asset, assets) ? ` · ${unitLabel(asset, assets)}` : ''}`,
      progress: b && b.units.length > 1 ? `в обходе ${inBatch} из ${b.units.length}` : undefined,
      sub: [
        already ? 'уже отсканирован' : '',
        (asset.locationId && placeName.get(asset.locationId)) || asset.location || '',
        asset.serialNumber ? `№ ${asset.serialNumber}` : '',
      ].filter(Boolean).join(' · '),
    });
    buzz(already ? [40, 60, 40] : 60);
  }

  /**
   * «Что это»: скан только показывает карточку и **ничего не пишет**.
   *
   * Отдельный режим, а не побочный эффект обхода: обход засчитывает предмет и
   * меняет акт, а тут человек просто спрашивает «что это». Смешивать нельзя —
   * иначе любопытный скан молча попадёт в инвентаризацию.
   */
  function registerInfo(raw: string) {
    const hit = resolve(raw);
    if (!hit) return;
    if (hit.unbound) {
      setInfo(null);
      setLast({ tone: 'bad', code: hit.code, title: 'Наклейка ни к чему не привязана', unbound: true });
      buzz([120]);
      return;
    }
    if (!hit.asset) {
      setInfo(null);
      setLast({ tone: 'bad', code: hit.code, title: 'Не найдено в базе' });
      buzz([120]);
      return;
    }
    setInfo(hit.asset);
    setLast({ tone: 'ok', code: hit.code, title: hit.asset.name });
    setFlash((n) => n + 1);
    buzz(60);
  }

  /** Оклейка: скан привязывает наклейку к следующему экземпляру партии. */
  async function registerBind(raw: string) {
    const code = normalizeTagCode(raw);
    if (!code || !looksLikeTag(raw)) return;
    if (!batch) {
      setLast({ tone: 'bad', code, title: 'Сначала выберите, что клеим' });
      return;
    }

    const known = tagListRef.current.find((t) => t.code === code);
    if (!known) {
      setLast({ tone: 'bad', code, title: 'Такой наклейки нет в системе' });
      buzz([120]);
      return;
    }
    if (known.assetId) {
      const on = byId.get(known.assetId);
      const mine = on && batch.units.some((u) => u.id === on.id);
      setLast({
        tone: 'dup',
        code,
        title: mine ? `Уже на ${unitLabel(on!, assets) || on!.invNumber}` : `Занята: ${on?.name || 'другое оборудование'}`,
        progress: `оклеено ${boundCount(batch)} из ${batch.units.length}`,
      });
      buzz([40, 60, 40]);
      return;
    }

    // Следующий экземпляр без наклейки. Порядок по инв. номеру, чтобы
    // оклеивание шло предсказуемо: 01, 02, 03…
    const bound = boundNow();
    const pinned = pinnedId ? batch.units.find((u) => u.id === pinnedId) : null;
    if (pinned && bound.has(pinned.id)) {
      setLast({ tone: 'dup', code, title: `У «${unitLabel(pinned, assets) || pinned.invNumber}» уже есть наклейка ${bound.get(pinned.id)}` });
      buzz([40, 60, 40]);
      return;
    }
    const target = pinned || batch.units.find((u) => !bound.has(u.id));
    if (!target) {
      setLast({ tone: 'dup', code, title: `У всех ${batch.units.length} уже есть наклейки` });
      buzz([40, 60, 40]);
      return;
    }

    // Оптимистично: рука уже тянется к следующей наклейке, ждать ответ сервера
    // на каждой — терять секунды двадцать раз подряд.
    tagListRef.current = tagListRef.current.map((t) => (t.code === code ? { ...t, assetId: target.id } : t));
    setTagList(tagListRef.current);
    const done = batch.units.filter((u) => boundNow().has(u.id)).length;
    const shown: Feedback = {
      tone: 'ok',
      code,
      title: `${target.name} · ${unitLabel(target, assets) || target.invNumber}`,
      progress: `оклеено ${done} из ${batch.units.length}`,
      state: 'saving',
    };
    setLast(shown);
    setFlash((n) => n + 1);
    buzz(60);

    try {
      const res = await fetch('/api/assets/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Место не задаём: у карточки оно уже есть, а менять его наклейкой —
        // лишний способ ошибиться.
        body: JSON.stringify({ code, asset_id: target.id }),
      });
      if (!res.ok) throw new Error();
      // Позднее «сохранено» не должно затирать уже следующий скан.
      setLast((cur) => (cur && cur.code === code ? { ...cur, state: 'saved' } : cur));

      /**
       * Партия не закончилась — камеру не закрываем и сами переходим к
       * следующему неоклеенному экземпляру: двадцать столов клеят подряд, и
       * лазить в список за каждым — двадцать лишних кругов. Закрываемся, только
       * когда наклейки есть у всех.
       */
      const nextFree = batch.units.find((u) => !boundNow().has(u.id));
      setPinnedId(nextFree ? nextFree.id : null);

      if (single && !nextFree) {
        // Захлопывать мгновенно нельзя: подтверждение надо успеть увидеть.
        // ⚠️ Обновление списка НЕ ждём: на медленной связи оно тянется секунды,
        // и камера висела бы открытой уже после «сохранено».
        void onBound();
        setTimeout(onClose, 1200);
        return;
      }

    } catch {
      // Откатываем: наклейка физически уже наклеена, но в учёте её нет —
      // человек должен это увидеть сразу, а не при следующей инвентаризации.
      tagListRef.current = tagListRef.current.map((t) => (t.code === code ? { ...t, assetId: null } : t));
      setTagList(tagListRef.current);
      setLast({ tone: 'bad', code, title: 'Не сохранилось — отсканируйте ещё раз', state: 'failed' });
      buzz([120, 60, 120]);
    }
  }

  // ⚠️ Цикл распознавания захватывает функцию один раз при запуске камеры, а
  // состояние с тех пор меняется каждым сканом. Без ref он звал бы обработчик
  // из первого рендера и не видел ни отсканированного, ни привязанного.
  const handleRef = useRef<(raw: string) => void>(() => {});

  /**
   * ⚠️ Камера читает наклейку по десять раз в секунду, пока она в кадре.
   * Без паузы сообщение «сохранено» тут же сменялось на «уже привязана» —
   * то есть ровно в момент успеха человек видел предупреждение. Пауза даёт
   * прочитать результат и убрать телефон.
   */
  const seenRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
  const REPEAT_MS = 2500;

  handleRef.current = (raw: string) => {
    const now = Date.now();
    if (raw === seenRef.current.code && now - seenRef.current.at < REPEAT_MS) return;
    seenRef.current = { code: raw, at: now };
    if (mode === 'bind') void registerBind(raw);
    else if (mode === 'info') registerInfo(raw);
    else registerAudit(raw);
  };

  /** Буфер обхода: связь в подвале пропадает, телефон садится. */
  useEffect(() => {
    if (!audit) return;
    try {
      const saved = localStorage.getItem(`asset-audit-${audit.id}`);
      if (saved) setScannedIds(new Set(JSON.parse(saved) as string[]));
    } catch { /* сломанный буфер лучше пропустить, чем ронять обход */ }
  }, [audit]);

  useEffect(() => {
    if (!audit) return;
    try {
      localStorage.setItem(`asset-audit-${audit.id}`, JSON.stringify(Array.from(scannedIds)));
    } catch { /* приватный режим — переживём */ }
  }, [audit, scannedIds]);

  /** Найти незакрытый обход. */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/assets/audits');
        const json = await res.json();
        if (json.open) setAudit({ id: json.open.id, locationId: json.open.locationId });
      } catch { /* без истории просто начнём новый */ }
    })();
  }, []);

  async function startAudit() {
    setStarting(true);
    try {
      const res = await fetch('/api/assets/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location_id: placeId === 'all' ? null : placeId }),
      });
      const json = await res.json();
      if (json.audit) setAudit({ id: json.audit.id, locationId: json.audit.locationId });
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setSupported(false);
        setError('Камера недоступна в этом браузере');
        return;
      }
      // ⚠️ getUserMedia не работает в незащищённом контексте — по http сканер
      // не откроется вообще, и это надо сказать словами.
      if (!window.isSecureContext) {
        setSupported(false);
        setError('Камера работает только по https. Откройте сайт по защищённой ссылке.');
        return;
      }

      try {
        /**
         * ⚠️ `BarcodeDetector` есть **только в Chromium**. В WebKit его нет ни
         * в одной версии Safari, а на iPhone все браузеры (включая Chrome и
         * Яндекс) — это WebKit. Запасной путь — jsQR: медленнее, но везде.
         */
        let detect: (v: HTMLVideoElement) => Promise<string[]> | string[];
        const Detector = (window as unknown as {
          BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
        }).BarcodeDetector;

        if (Detector) {
          const d = new Detector({ formats: ['qr_code'] });
          detect = async (video) => (await d.detect(video)).map((c) => c.rawValue || '');
        } else {
          const { default: jsQR } = await import('jsqr');

          /**
           * ⚠️ Читаем **середину кадра в родных пикселях**, а не весь кадр,
           * сжатый до 640px.
           *
           * Из-за сжатия наклейка 44 мм с расстояния вытянутой руки давала
           * меньше двух пикселей на модуль QR — jsQR такое не берёт, и сканер
           * «не реагировал ни на что», хотя штатная камера телефона тот же код
           * читала мгновенно (она снимает в полном разрешении). Середина —
           * это ровно то, что обведено рамкой-прицелом.
           *
           * Каждый третий кадр всё же разбираем целиком (сжатым): код может
           * оказаться сбоку, и терять его из-за прицела нельзя.
           */
          let tick = 0;
          const read = (video: HTMLVideoElement, sx: number, sy: number, sw: number, sh: number, max: number) => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const scale = Math.min(1, max / sw);
            const w = Math.max(1, Math.round(sw * scale));
            const h = Math.max(1, Math.round(sh * scale));
            if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
            return jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data || null;
          };

          detect = (video) => {
            if (!video.videoWidth) return [];
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            tick++;

            if (tick % 3 !== 0) {
              const side = Math.round(Math.min(vw, vh) * 0.72);
              const hit = read(video, Math.round((vw - side) / 2), Math.round((vh - side) / 2), side, side, 1000);
              if (hit) return [hit];
            }
            const whole = read(video, 0, 0, vw, vh, 800);
            return whole ? [whole] : [];
          };
        }

        // ⚠️ `exact` не ставим: на ноутбуке и на планшете задней камеры может
        // не быть вовсе, и с `exact` getUserMedia падает вместо того, чтобы
        // взять единственную.
        // ⚠️ Разрешение просим явно. По умолчанию iPhone отдаёт 640×480 — при
        // таком кадре мелкий QR наклейки физически неразличим, и сканер молчит.
        // `ideal`, а не `exact`: где столько нет, браузер сам возьмёт меньше.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        // Фонарик есть только у задней камеры и только в Chromium — кнопку
        // показываем, когда трек действительно это умеет.
        const track = stream.getVideoTracks()[0];
        const caps = (track?.getCapabilities?.() || {}) as { torch?: boolean };
        setHasTorch(Boolean(caps.torch));
        setTorchOn(false);
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        // ⚠️ play() на iPhone умеет отказать (режим энергосбережения, политика
        // автовоспроизведения). Раньше отказ обрывал весь запуск — картинка
        // была, а распознавание не начиналось. Теперь это просто отметка.
        try {
          await video.play();
        } catch {
          setError('Видео не запустилось само — коснитесь кадра');
        }
        const engine = Detector ? 'BarcodeDetector' : 'jsQR';
        setDiag({ engine, size: 'ждём кадр', frames: 0 });

        // Программное декодирование дорогое: 10 кадров в секунду достаточно,
        // чтобы поймать наклейку, и телефон при этом не греется.
        let lastRun = 0;
        // Состояние обновляем раз в секунду: по нему видно, идут ли кадры и в
        // каком они разрешении — первое, что нужно знать, когда «не сканирует».
        let frames = 0;
        let lastDiag = 0;
        const loop = async () => {
          if (cancelled) return;
          // ⚠️ Пустой ref — не повод останавливать распознавание навсегда:
          // при перерисовке элемент на кадр-другой пропадает, а прежний код
          // на этом обрывал цикл, и камера дальше просто показывала картинку.
          if (!videoRef.current) { rafRef.current = requestAnimationFrame(loop); return; }
          const now = performance.now();
          if (now - lastRun >= 100) {
            lastRun = now;
            try {
              for (const raw of await detect(videoRef.current)) handleRef.current(raw);
              frames++;
            } catch { /* кадр не распознался — не страшно */ }
            if (now - lastDiag > 1000) {
              lastDiag = now;
              const v = videoRef.current;
              setDiag({
                engine,
                size: v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : 'кадра нет',
                frames,
              });
            }
          }
          rafRef.current = requestAnimationFrame(loop);
        };
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        // ⚠️ Родной текст ошибки нечитаем («The request is not allowed by the
        // user agent…»), а решение у каждой из них разное — переводим.
        const name = e instanceof Error ? e.name : '';
        const RU: Record<string, string> = {
          NotAllowedError: 'Доступ к камере запрещён. Разреши камеру для сайта в настройках браузера и нажми «Повторить».',
          NotFoundError: 'Камера не найдена на этом устройстве.',
          NotReadableError: 'Камеру занял другой приложение или вкладка — закрой их и нажми «Повторить».',
          OverconstrainedError: 'Такой камеры нет — переключись на другую кнопкой 🔄.',
          SecurityError: 'Браузер заблокировал камеру на этой странице.',
        };
        setError(RU[name] || (e instanceof Error ? `${name}: ${e.message}` : 'Не удалось открыть камеру'));
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, retry]);

  /** Фонарик. Гасить его при закрытии не нужно — трек останавливается целиком. */
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      // `torch` пока вне типов MediaTrackConstraintSet — отсюда приведение.
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as unknown as MediaTrackConstraints);
      setTorchOn((v) => !v);
    } catch {
      setHasTorch(false);
    }
  }

  const pinnedUnit = pinnedId ? byId.get(pinnedId) || null : null;
  const scannedInScope = scope.filter((a) => scannedIds.has(a.id)).length;
  const missing = scope.filter((a) => !scannedIds.has(a.id));

  return (
    <div className="scan-overlay">
      <div className={`scan-sheet ${mode === 'bind' || mode === 'info' ? 'scan-sheet--cam' : ''}`}>
        <div className="scan-sheet__head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>
              {mode === 'bind' ? '🏷 Оклейка' : mode === 'info' ? 'ℹ️ Что это' : '📷 Инвентаризация'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {mode === 'bind'
                ? 'Наклей пустую наклейку и наведи камеру — привяжется само'
                : mode === 'info'
                  ? 'Наведи на наклейку — покажу карточку. Ничего не записывается'
                  : 'Наведите камеру на наклейку'}
            </div>
          </div>
          <button type="button" className="btn btn--sm" onClick={onClose}>✕</button>
        </div>

        {/* В оклейке кадр занимает всё, что осталось от экрана: под ним больше
            ничего нет, а наводить наклейку с вытянутой руки по маленькому
            окошку неудобно. */}
        <div className={`scan-sheet__video ${mode === 'bind' || mode === 'info' ? 'scan-sheet__video--full' : ''}`}>
          {/* ⚠️ Сообщение об ошибке — поверх кадра и всегда, когда оно есть.
              Прежде оно рисовалось только вместо камеры (`supported === false`),
              а отказ в доступе оставлял чёрный экран без объяснений. */}
          {error && (
            <div className="scan-error">
              <div style={{ fontSize: 28 }}>📷</div>
              <div>{error}</div>
              <button type="button" className="btn btn--sm" onClick={() => { setError(''); setRetry((n) => n + 1); }}>Повторить</button>
            </div>
          )}
          {supported ? (
            <>
              {/* Фронталку зеркалим: иначе рука на экране едет не в ту сторону,
                  и навести наклейку в рамку почти невозможно. */}
              <video
                ref={videoRef}
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : undefined }}
              />
              <div className="scan-cam-controls">
                <button
                  type="button"
                  className="scan-cam-btn"
                  onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
                  title={facing === 'environment' ? 'Фронтальная камера' : 'Основная камера'}
                >
                  🔄
                </button>
                {hasTorch && (
                  <button
                    type="button"
                    className={`scan-cam-btn ${torchOn ? 'is-on' : ''}`}
                    onClick={toggleTorch}
                    title="Фонарик"
                  >
                    🔦
                  </button>
                )}
              </div>
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              <div className="scan-reticle" />
              {/* Вспышка на весь кадр — подтверждение, которое видно, даже
                  когда телефон в вытянутой руке и текст не читается. */}
              {flash > 0 && <div key={flash} className="scan-flash" />}
              {mode === 'info' && info && (
                <InfoCard
                  asset={info}
                  all={assets}
                  tag={tagByAsset.get(info.id)}
                  place={(info.locationId && placeName.get(info.locationId)) || info.location || ''}
                  onClose={() => { setInfo(null); setLast(null); }}
                />
              )}
              {mode === 'bind' && batch && (
                <div className="scan-target">
                  <div className="scan-target__name">
                    {batch.name}
                    {/* Пришли из списка — говорим, на какой именно экземпляр
                        уйдёт наклейка: иначе кажется, что клеим «во что-то». */}
                    {pinnedUnit && <div className="scan-target__unit">→ {unitLabel(pinnedUnit, assets) || pinnedUnit.invNumber}</div>}
                  </div>
                  <div className="scan-target__count">{boundCount(batch)} из {batch.units.length}</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ padding: 24, color: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 10 }}>📷</div>
              <div>{error || 'Сканер недоступен'}</div>
            </div>
          )}
        </div>

        {diag && (
          <div className="scan-diag">
            распознаватель: <b>{diag.engine}</b> · кадр: <b>{diag.size}</b> · разобрано кадров: <b>{diag.frames}</b>
          </div>
        )}

        <div className={`scan-feedback ${last ? `scan-feedback--${last.tone}` : ''}`}>
          {last ? (
            <>
              <span style={{ fontSize: 18 }}>{last.tone === 'ok' ? '✅' : last.tone === 'dup' ? '🔁' : '⚠️'}</span>
              <div style={{ fontSize: 13, lineHeight: 1.4, flex: 1 }}>
                <b style={{ fontFamily: 'monospace' }}>{last.code}</b> — {last.title}
                {/* «Сохранено» появляется только после ответа сервера:
                    наклейка уже на предмете, и обещать запись авансом нельзя. */}
                {last.state === 'saving' && <span className="scan-state">сохраняю…</span>}
                {last.state === 'saved' && <span className="scan-state scan-state--ok">✓ сохранено</span>}
                {last.unbound && mode === 'audit' && (
                  <button type="button" className="btn btn--sm" style={{ marginLeft: 8 }} onClick={() => setBinding(last.code)}>
                    Привязать
                  </button>
                )}
                {/* Крупно и отдельной строкой: на это смотрят, не останавливаясь. */}
                {last.progress && (
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{last.progress}</div>
                )}
                {last.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{last.sub}</div>}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Наведите на QR-код…</div>
          )}
        </div>

        <div className="scan-sheet__body">
          {mode === 'info' ? (
            /* Кроме камеры здесь нужен только ручной ввод: наклейку заляпали,
               а узнать, что это, всё равно надо. */
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="input"
                value={manual}
                placeholder="Код наклейки или инв. номер"
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { handleRef.current(manual); setManual(''); } }}
              />
              <button type="button" className="btn btn--sm" onClick={() => { handleRef.current(manual); setManual(''); }}>Найти</button>
            </div>
          ) : mode === 'bind' ? (
            <>
              {/* ⚠️ Под камерой больше ничего нет. Здесь была лента выбора
                  оборудования, поиск, место и список экземпляров — убрано
                  13.08.2026: предмет всё равно выбирают в списке описи, а лента
                  отнимала у кадра половину экрана. */}
              {!batch && (
                <div className="banner banner--warn">
                  Не понятно, к чему клеить. Закрой камеру, найди оборудование в списке и нажми 📷 в его строке.
                </div>
              )}

              {/* Код руками — когда наклейка помялась при поклейке или камера
                  не берёт её под плёнкой. Без этого оклейка вставала целиком. */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={manual}
                  placeholder="Код наклейки, если не читается"
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleRef.current(manual); setManual(''); } }}
                />
                <button type="button" className="btn btn--sm" onClick={() => { handleRef.current(manual); setManual(''); }}>
                  Привязать
                </button>
              </div>
            </>
          ) : (
            <>
              {locations.length > 0 && !audit && (
                <select className="select" value={placeId} onChange={(e) => setPlaceId(e.target.value)}>
                  <option value="all">Всё оборудование ({assets.length})</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name} ({assets.filter((a) => a.locationId === l.id).length})</option>
                  ))}
                </select>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Отсканировано</span>
                <span style={{ fontSize: 20, fontWeight: 800 }}>
                  {scannedInScope} <span style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 600 }}>из {scope.length}</span>
                </span>
              </div>

              {/* Наклейка бывает залеплена или содрана — тогда номер вбивают
                  руками, иначе единица «не найдена» без вины обходчика. */}
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  value={manual}
                  placeholder="Код наклейки или инв. номер"
                  onChange={(e) => setManual(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { handleRef.current(manual); setManual(''); } }}
                />
                <button type="button" className="btn btn--sm" onClick={() => { handleRef.current(manual); setManual(''); }}>Добавить</button>
              </div>

              <button type="button" className="btn btn--sm" onClick={() => setShowMissing((v) => !v)}>
                {showMissing ? 'Скрыть ненайденное' : `Не найдено: ${missing.length}`}
              </button>

              {showMissing && (
                <div className="scan-missing">
                  {missing.length === 0 ? (
                    <div className="empty-state">Всё на месте</div>
                  ) : missing.map((a) => (
                    <div key={a.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <b style={{ fontFamily: 'monospace' }}>{a.invNumber}</b> · {a.name}
                      {unitLabel(a, assets) && <span style={{ color: 'var(--text-muted)' }}> · {unitLabel(a, assets)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="scan-sheet__foot">
          {/* В оклейке одной наклейки кнопка одна: камера и так закрывается
              сама после привязки, «Свернуть» рядом с «Готово» только путало. */}
          {!single && mode !== 'info' && <button type="button" className="btn" onClick={onClose}>Свернуть</button>}
          {mode === 'info' ? (
            <button type="button" className="btn btn--primary" onClick={onClose}>Закрыть</button>
          ) : mode === 'bind' ? (
            <button type="button" className="btn btn--primary" onClick={async () => { await onBound(); onClose(); }}>
              {single ? 'Закрыть' : 'Готово'}
            </button>
          ) : audit ? (
            <button
              type="button"
              className="btn btn--primary"
              disabled={saving}
              onClick={async () => {
                if (!confirm(`Закрыть обход? Ненайденных — ${missing.length}, они попадут в акт.`)) return;
                setSaving(true);
                try {
                  await onFinish(audit.id, Array.from(scannedIds));
                  localStorage.removeItem(`asset-audit-${audit.id}`);
                } finally { setSaving(false); }
              }}
            >
              {saving ? 'Закрываю…' : `Закрыть обход · ${scannedIds.size}`}
            </button>
          ) : (
            <button type="button" className="btn btn--primary" disabled={starting} onClick={startAudit}>
              {starting ? 'Начинаю…' : '▶️ Начать обход'}
            </button>
          )}
        </div>
      </div>

      {binding && (
        <BindTagModal
          code={binding}
          assets={assets}
          locations={locations}
          onClose={() => setBinding(null)}
          onDone={async () => {
            setBinding(null);
            setLast(null);
            await onBound();
          }}
        />
      )}
    </div>
  );
}

/**
 * Привязка одиночной наклейки — когда предмет один, а не партия из двадцати.
 *
 * Порядок намеренно обратный привычному: сначала клеим пустые наклейки, а
 * выбираем оборудование, когда предмет уже перед глазами. Наклейку,
 * напечатанную «под морозилку», легко налепить не на ту морозилку.
 */
function BindTagModal({ code, assets, locations, onClose, onDone }: {
  code: string;
  assets: Asset[];
  locations: AssetLocation[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [assetId, setAssetId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return assets
      .filter((a) => (a.name || '').toLowerCase().includes(q) || (a.invNumber || '').toLowerCase().includes(q))
      .slice(0, 12);
  }, [assets, query]);

  const chosen = assets.find((a) => a.id === assetId);

  async function bind(force = false) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/assets/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, asset_id: assetId, location_id: locationId || null, force }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Перепривязка занятой наклейки — только осознанно: случайный скан не
        // должен молча переклеить учёт.
        if (confirm(`Наклейка уже на «${json.current?.name || 'другом оборудовании'}». Переклеить?`)) return bind(true);
        setError('Привязка отменена');
        return;
      }
      if (!res.ok) { setError(json.error || 'Не удалось привязать'); return; }
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="scan-overlay" style={{ zIndex: 1300 }}>
      <div className="scan-sheet">
        <div className="scan-sheet__head">
          <div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>🏷 Привязать наклейку</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'var(--text-muted)' }}>{code}</div>
          </div>
          <button type="button" className="btn btn--sm" onClick={onClose}>✕</button>
        </div>

        <div className="scan-sheet__body">
          {error && <div className="banner banner--error">{error}</div>}

          <input
            className="input"
            placeholder="Что это? Название или инв. номер"
            value={chosen ? `${chosen.invNumber} · ${chosen.name}` : query}
            onChange={(e) => { setAssetId(''); setQuery(e.target.value); }}
          />

          {!chosen && found.map((a) => (
            <button
              key={a.id}
              type="button"
              className="btn btn--sm"
              style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              onClick={() => { setAssetId(a.id); setLocationId(a.locationId || ''); }}
            >
              <b style={{ fontFamily: 'monospace' }}>{a.invNumber}</b>&nbsp;· {a.name}
              {unitLabel(a, assets) && <span style={{ color: 'var(--text-muted)' }}>&nbsp;· {unitLabel(a, assets)}</span>}
            </button>
          ))}

          <select className="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Место не указано</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div className="scan-sheet__foot">
          <button type="button" className="btn" onClick={onClose}>Отмена</button>
          <button type="button" className="btn btn--primary" disabled={!assetId || busy} onClick={() => bind(false)}>
            {busy ? 'Сохраняю…' : 'Привязать'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Карточка предмета поверх кадра — ответ на вопрос «что это».
 *
 * Именно поверх, а не отдельной страницей: телефон уже поднят к наклейке,
 * и уводить человека с камеры ради двух строк данных незачем — следующий
 * скан просто заменит карточку.
 */
function InfoCard({ asset, all, tag, place, onClose }: {
  asset: Asset;
  all: Asset[];
  tag?: string;
  place: string;
  onClose: () => void;
}) {
  const money = (v: unknown) => `${Math.round(Number(v) || 0).toLocaleString('ru-RU')} сум`;
  const day = (v: string | Date | null | undefined) => (v ? new Date(v).toLocaleDateString('ru-RU') : '—');
  const st = STATUS_LABEL[asset.status || 'in_use'] || STATUS_LABEL.in_use;

  return (
    <div className="scan-info">
      <div className="scan-info__head">
        <div>
          <div className="scan-info__name">{asset.name}</div>
          <div className="scan-info__inv">
            {asset.invNumber}
            {unitLabel(asset, all) && <span> · {unitLabel(asset, all)}</span>}
          </div>
        </div>
        <button type="button" className="scan-cam-btn" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <dl className="scan-info__rows">
        <div><dt>Место</dt><dd>{place || '—'}</dd></div>
        {/* Дефолтное «Материально-ответственное лицо» стоит почти у всех и
            ничего не сообщает — в карточке это просто длинная строка. */}
        <div><dt>МОЛ</dt><dd>{asset.responsiblePerson && asset.responsiblePerson !== 'Материально-ответственное лицо' ? asset.responsiblePerson : '—'}</dd></div>
        <div><dt>Наклейка</dt><dd>{tag || 'нет'}</dd></div>
        <div><dt>Стоимость</dt><dd>{money(asset.initialCost)}</dd></div>
        <div><dt>Статус</dt><dd>{st}</dd></div>
        <div><dt>Последний обход</dt><dd>{day(asset.lastInventoriedAt)}</dd></div>
        {asset.serialNumber && <div><dt>Код iiko</dt><dd>{asset.serialNumber}</dd></div>}
        <div><dt>Дата ввода</dt><dd>{day(asset.commissioningDate)}</dd></div>
      </dl>

      <a className="btn btn--sm" href={`/dashboard/assets/${asset.id}`} target="_blank" rel="noreferrer">
        Открыть карточку целиком
      </a>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  in_use: '🟢 В эксплуатации',
  repair: '🟡 В ремонте',
  in_stock: '🔵 На складе',
  written_off: '🔴 Списан',
  sold: '⚪ Продан',
  archived: '📦 Архив',
};
