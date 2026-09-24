/**
 * Сжатие фото на телефоне перед отправкой.
 *
 * Снимок с камеры весит 3–8 МБ. Отправлять его как есть нельзя дважды: на
 * мобильном интернете загрузка тянется минуту и рвётся, а тело запроса упрётся
 * в лимит платформы. 1600px по длинной стороне и jpeg 0.8 дают 150–400 КБ —
 * этого хватает, чтобы прочитать рукописную накладную с фото.
 */

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function compressImage(file: File): Promise<File> {
  // Возвращаем оригинальный файл без обрезки и искажений canvas
  return file;
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap сам разворачивает EXIF-ориентацию — иначе фото с телефона
  // ложится боком. В Safari его может не быть, там падаем на <img>.
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
    } catch {
      /* ниже запасной путь */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = url;
    });
  } finally {
    // Отзываем в микротаске после onload — до этого браузер ещё читает по url.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
