/**
 * 解析文本中的 CDN 图片 URL 并转换为 Base64
 */

interface ParsedImage {
  url: string;
  alt?: string;
}

interface ParsedContent {
  textParts: string[];
  imageUrls: ParsedImage[];
}

/**
 * 从文本中解析 Markdown 格式的图片 ![alt](url)
 * @param text 包含图片 Markdown 的文本
 * @returns 解析后的文本和图片数组
 */
export const parseMarkdownImages = (text: string): ParsedContent => {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const textParts: string[] = [];
  const imageUrls: ParsedImage[] = [];
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(text)) !== null) {
    // 添加图片前的文本
    if (match.index > lastIndex) {
      const textBefore = text.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        textParts.push(textBefore);
      }
    }

    // 提取图片信息
    imageUrls.push({
      url: match[2],
      alt: match[1]
    });

    lastIndex = match.index + match[0].length;
  }

  // 添加最后一段文本
  if (lastIndex < text.length) {
    const remainingText = text.slice(lastIndex);
    if (remainingText.trim()) {
      textParts.push(remainingText);
    }
  }

  // 如果没有找到图片，整个文本作为文本部分
  if (imageUrls.length === 0 && text.trim()) {
    textParts.push(text);
  }

  return { textParts, imageUrls };
};

/**
 * 验证 URL 是否为有效的图片 URL
 * @param url 图片 URL
 * @returns 是否为有效图片 URL
 */
export const isValidImageUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    const validImageExtensions = /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i;
    const validImageMimeTypes = /image\/(jpg|jpeg|png|gif|webp|svg)/i;

    // 检查文件扩展名
    if (validImageExtensions.test(url)) {
      return true;
    }

    // 检查 URL 路径中是否包含 image 关键词
    if (url.toLowerCase().includes('image')) {
      return true;
    }

    // 检查是否为已知的图片 CDN 域名
    const knownImageDomains = [
      'googlecdn.datas.systems',
      'cdn.google.com',
      'storage.googleapis.com',
      'lh3.googleusercontent.com'
    ];

    return knownImageDomains.some(domain =>
      urlObj.hostname.includes(domain)
    );
  } catch {
    return false;
  }
};

/**
 * 将 Blob 转换为 Base64 字符串（使用 FileReader，支持大文件）
 * @param blob Blob 对象
 * @returns Promise<string> Base64 字符串（不含 data URL 前缀）
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // 移除 data URL 前缀 "data:image/png;base64,"
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = () => reject(new Error('FileReader 读取失败'));
    reader.readAsDataURL(blob);
  });
};

/**
 * 从 CDN URL 下载图片并转换为 Base64
 * @param url 图片 URL
 * @param timeout 请求超时时间（毫秒）
 * @returns Promise<{ mimeType: string; base64Data: string }>
 */
export const downloadImageAsBase64 = async (
  url: string,
  timeout: number = 10000
): Promise<{ mimeType: string; base64Data: string }> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // 有些 CDN 需要特定的 headers
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // 从 Content-Type 头获取 MIME 类型，如果没有则从 URL 推断
    const contentType = response.headers.get('content-type') || 'image/png';

    // 使用 Blob + FileReader 方式转换，避免大图片栈溢出
    const blob = await response.blob();
    const base64Data = await blobToBase64(blob);

    return {
      mimeType: contentType,
      base64Data
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted) {
      throw new Error('图片下载超时');
    }
    throw error;
  }
};

/**
 * 批量处理多个图片 URL
 * @param urls 图片 URL 数组
 * @param concurrency 并发下载数量
 * @param timeout 单个请求超时时间
 * @returns Promise<Array<{ url: string; mimeType: string; base64Data: string } | null>>
 */
export const batchDownloadImages = async (
  urls: string[],
  concurrency: number = 3,
  timeout: number = 10000
): Promise<Array<{ url: string; mimeType: string; base64Data: string } | null>> => {
  const results: Array<{ url: string; mimeType: string; base64Data: string } | null> =
    new Array(urls.length).fill(null);

  const processBatch = async (startIndex: number) => {
    for (let i = startIndex; i < urls.length && i < startIndex + concurrency; i++) {
      try {
        if (isValidImageUrl(urls[i])) {
          const imageData = await downloadImageAsBase64(urls[i], timeout);
          results[i] = { ...imageData, url: urls[i] };
        } else {
          console.warn(`跳过无效的图片 URL: ${urls[i]}`);
          results[i] = null;
        }
      } catch (error) {
        console.error(`下载图片失败 ${urls[i]}:`, error);
        results[i] = null;
      }
    }
  };

  // 分批处理所有 URL
  const batches = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    batches.push(processBatch(i));
  }

  await Promise.all(batches);
  return results;
};

/**
 * 检查文本是否包含 CDN 图片
 * @param text 文本内容
 * @returns 是否包含 CDN 图片
 */
export const containsCdnImages = (text: string): boolean => {
  const { imageUrls } = parseMarkdownImages(text);
  return imageUrls.some(img => isValidImageUrl(img.url));
};
