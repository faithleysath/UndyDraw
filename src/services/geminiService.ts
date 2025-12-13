import type { Content, Part as SDKPart } from "@google/genai";
import { AppSettings, Part } from '../types';
import { parseMarkdownImages, containsCdnImages, batchDownloadImages } from '../utils/imageUrlParser';

// Helper function to get model based on resolution
const getModelByResolution = (settings: AppSettings): string => {
  // 只有在 Pro 模式下才使用分辨率模型映射
  if (settings.isPro && settings.resolutionModelMap?.[settings.resolution]) {
    return settings.resolutionModelMap[settings.resolution]!;
  }
  // 否则使用默认模型
  return settings.modelName || "gemini-3-pro-image-preview";
};

// Helper to construct user content
const constructUserContent = (prompt: string, images: { base64Data: string; mimeType: string }[]): Content => {
  const userParts: SDKPart[] = [];
  
  images.forEach((img) => {
    userParts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.base64Data,
      },
    });
  });

  if (prompt.trim()) {
    userParts.push({ text: prompt });
  }

  return {
    role: "user",
    parts: userParts,
  };
};

// Helper to format Gemini API errors
const formatGeminiError = (error: any): Error => {
  let message = "发生了未知错误，请稍后重试。";
  const errorMsg = error?.message || error?.toString() || "";

  if (errorMsg.includes("401") || errorMsg.includes("API key not valid")) {
    message = "API Key 无效或过期，请检查您的设置。";
  } else if (errorMsg.includes("403")) {
    message = "访问被拒绝。请检查您的网络连接（可能需要切换节点）或 API Key 权限。";
  } else if (errorMsg.includes("Thinking_config.include_thoughts") || errorMsg.includes("thinking is enabled")) {
    message = "当前模型不支持思考过程。请在设置中关闭“显示思考过程”，或切换到支持思考的模型。";
  } else if (errorMsg.includes("400")) {
    message = "请求参数无效 (400 Bad Request)。请检查您的设置或提示词。";
  } else if (errorMsg.includes("429")) {
    message = "请求过于频繁，请稍后再试（429 Too Many Requests）。";
  } else if (errorMsg.includes("503")) {
    message = "Gemini 服务暂时不可用，请稍后重试（503 Service Unavailable）。";
  } else if (errorMsg.includes("TypeError") || errorMsg.includes("Failed to fetch") || errorMsg.includes("NetworkError")) {
    message = "网络请求失败。可能是网络连接问题，或者请求内容过多（如图片太大、历史记录过长）。";
  } else if (errorMsg.includes("SAFETY")) {
    message = "生成的内容因安全策略被拦截。请尝试修改您的提示词。";
  } else if (errorMsg.includes("404")) {
    message = "请求的模型不存在或路径错误 (404 Not Found)。";
  } else if (errorMsg.includes("500")) {
    message = "Gemini 服务器内部错误，请稍后重试 (500 Internal Server Error)。";
  } else {
      // 保留原始错误信息以便调试，但在前面加上中文提示
      message = `请求出错: ${errorMsg}`;
  }

  const newError = new Error(message);
  (newError as any).originalError = error;
  return newError;
};

// Helper to process text and extract CDN images, converting them to inlineData format
const processTextWithCdnImages = async (
  text: string,
  isThought: boolean = false,
  signature?: string
): Promise<Part[]> => {
  const parts: Part[] = [];

  try {
    const { textParts, imageUrls } = parseMarkdownImages(text);

    // 处理文本部分
    textParts.forEach((textPart) => {
      if (textPart.trim()) {
        parts.push({
          text: textPart,
          thought: isThought,
          ...(signature && { thoughtSignature: signature })
        });
      }
    });

    // 处理图片部分
    if (imageUrls.length > 0) {
      // 批量下载图片
      const imageResults = await batchDownloadImages(
        imageUrls.map(img => img.url),
        3, // 并发下载数量
        10000 // 10秒超时
      );

      imageResults.forEach((imageData, index) => {
        if (imageData) {
          parts.push({
            inlineData: {
              mimeType: imageData.mimeType,
              data: imageData.base64Data
            },
            thought: isThought,
            ...(signature && { thoughtSignature: signature })
          });
        } else {
          // 如果图片下载失败，保留原始的 Markdown 文本
          const originalMarkdown = `![${imageUrls[index].alt || 'image'}](${imageUrls[index].url})`;
          const lastTextPart = parts[parts.length - 1];
          if (lastTextPart && lastTextPart.text) {
            lastTextPart.text += (lastTextPart.text.endsWith(' ') ? '' : ' ') + originalMarkdown;
          } else {
            parts.push({
              text: originalMarkdown,
              thought: isThought,
              ...(signature && { thoughtSignature: signature })
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('处理 CDN 图片时出错:', error);
    // 出错时保留原始文本
    parts.push({
      text: text,
      thought: isThought,
      ...(signature && { thoughtSignature: signature })
    });
  }

  return parts;
};

// Helper to process SDK parts into app Parts (supports mixed response formats)
const processSdkParts = async (sdkParts: SDKPart[], enableCdnProcessing: boolean = true): Promise<Part[]> => {
  const appParts: Part[] = [];
  const textProcessingQueue: Array<{
    text: string;
    isThought: boolean;
    signature?: string;
  }> = [];

  for (const part of sdkParts) {
    const signature = (part as any).thoughtSignature;
    const isThought = !!(part as any).thought;

    // Handle Text (check for CDN images)
    if (part.text !== undefined) {
      // 检查文本是否包含 CDN 图片且启用处理
      if (enableCdnProcessing && containsCdnImages(part.text)) {
        // 将需要处理 CDN 图片的文本加入队列
        textProcessingQueue.push({
          text: part.text,
          isThought,
          signature
        });
      } else {
        // 处理普通文本
        const lastPart = appParts[appParts.length - 1];

        // Check if we should append to the last part or start a new one.
        if (
          lastPart &&
          lastPart.text !== undefined &&
          !!lastPart.thought === isThought
        ) {
          lastPart.text += part.text;
          if (signature) {
              lastPart.thoughtSignature = signature;
          }
        } else {
          // New text block
          const newPart: Part = {
            text: part.text,
            thought: isThought
          };
          if (signature) {
              newPart.thoughtSignature = signature;
          }
          appParts.push(newPart);
        }
      }
    }
    // Handle Images (inlineData format)
    else if (part.inlineData) {
      const newPart: Part = {
        inlineData: {
            mimeType: part.inlineData.mimeType || 'image/png',
            data: part.inlineData.data || ''
        },
        thought: isThought
      };
      if (signature) {
          newPart.thoughtSignature = signature;
      }
      appParts.push(newPart);
    }
  }

  // 处理包含 CDN 图片的文本
  if (textProcessingQueue.length > 0) {
    const processedTextParts = await Promise.all(
      textProcessingQueue.map(async ({ text, isThought, signature }) =>
        processTextWithCdnImages(text, isThought, signature)
      )
    );

    // 将处理后的部分合并到结果中
    processedTextParts.flat().forEach(processedPart => {
      appParts.push(processedPart);
    });
  }

  return appParts;
};

export const streamGeminiResponse = async function* (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal
) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl: settings.customEndpoint || 'https://undyapi.com' } }
  );

  // Filter out thought parts from history to avoid sending thought chains back to the model
  const cleanHistory = history.map(item => {
    if (item.role === 'model') {
      return {
        ...item,
        parts: item.parts.filter(p => !p.thought)
      };
    }
    return item;
  }).filter(item => item.parts.length > 0);

  const currentUserContent = constructUserContent(prompt, images);
  const contentsPayload = [...cleanHistory, currentUserContent];

  try {
    const responseStream = await ai.models.generateContentStream({
      model: getModelByResolution(settings),
      contents: contentsPayload,
      config: {
        ...(settings.isPro ? {
          imageConfig: {
            imageSize: settings.resolution,
            ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
          },
          tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
        } : {}),
        responseModalities: ["TEXT", "IMAGE"],
        ...(settings.isPro && settings.enableThinking ? {
            thinkingConfig: {
                includeThoughts: true,
            }
        } : {}),
      },
    });

    let currentParts: Part[] = [];
    let pendingTextBuffer = "";
    let lastThoughtState = false;
    let lastSignature: string | undefined;

    for await (const chunk of responseStream) {
      if (signal?.aborted) {
        break;
      }
      const candidates = chunk.candidates;
      if (!candidates || candidates.length === 0) continue;

      const newParts = candidates[0].content?.parts || [];

      // Process new parts
      for (const part of newParts) {
        const signature = (part as any).thoughtSignature;
        const isThought = !!(part as any).thought;

        if (part.text !== undefined) {
          // Accumulate text to check for complete CDN image URLs
          pendingTextBuffer += part.text;
          lastThoughtState = isThought;
          lastSignature = signature;

          // Check if we have complete image URLs in the buffer and CDN processing is enabled
          if (settings.enableCdnImageProcessing && containsCdnImages(pendingTextBuffer)) {
            // Process the accumulated text for CDN images
            try {
              const processedParts = await processTextWithCdnImages(
                pendingTextBuffer,
                isThought,
                signature
              );

              // Replace or append to currentParts
              // Find the last text part and replace it, or append new parts
              const lastTextIndex = currentParts
                .map((p, i) => ({ part: p, index: i }))
                .reverse()
                .find(({ part }) => part.text !== undefined)?.index;

              if (lastTextIndex !== undefined) {
                // Remove the last text part
                currentParts.splice(lastTextIndex, 1);
                // Add processed parts
                currentParts.push(...processedParts);
              } else {
                // Just append if no previous text part
                currentParts.push(...processedParts);
              }

              // Clear the buffer
              pendingTextBuffer = "";
            } catch (error) {
              console.error('处理 CDN 图片时出错，保留原始文本:', error);
              // Fallback: add text as regular part
              const lastPart = currentParts[currentParts.length - 1];
              if (
                lastPart &&
                lastPart.text !== undefined &&
                !!lastPart.thought === isThought
              ) {
                lastPart.text += part.text;
                if (signature) {
                  lastPart.thoughtSignature = signature;
                }
              } else {
                currentParts.push({
                  text: pendingTextBuffer,
                  thought: isThought,
                  ...(signature && { thoughtSignature: signature })
                });
              }
              pendingTextBuffer = "";
            }
          } else {
            // Regular text, append to last text part or create new one
            const lastPart = currentParts[currentParts.length - 1];
            if (
              lastPart &&
              lastPart.text !== undefined &&
              !!lastPart.thought === isThought
            ) {
              lastPart.text += part.text;
              if (signature) {
                lastPart.thoughtSignature = signature;
              }
            } else {
              currentParts.push({
                text: part.text,
                thought: isThought,
                ...(signature && { thoughtSignature: signature })
              });
            }
          }
        } else if (part.inlineData) {
          // Handle any pending text first
          if (pendingTextBuffer.trim()) {
            currentParts.push({
              text: pendingTextBuffer,
              thought: lastThoughtState,
              ...(lastSignature && { thoughtSignature: lastSignature })
            });
            pendingTextBuffer = "";
          }

          const newPart: Part = {
            inlineData: {
              mimeType: part.inlineData.mimeType || 'image/png',
              data: part.inlineData.data || ''
            },
            thought: isThought
          };
          if (signature) {
            newPart.thoughtSignature = signature;
          }
          currentParts.push(newPart);
        }
      }

      yield {
        userContent: currentUserContent,
        modelParts: currentParts
      };
    }

    // Handle any remaining text buffer
    if (pendingTextBuffer.trim()) {
      currentParts.push({
        text: pendingTextBuffer,
        thought: lastThoughtState,
        ...(lastSignature && { thoughtSignature: lastSignature })
      });
    }
  } catch (error) {
    console.error("Gemini API Stream Error:", error);
    throw formatGeminiError(error);
  }
};

export const generateContent = async (
  apiKey: string,
  history: Content[],
  prompt: string,
  images: { base64Data: string; mimeType: string }[],
  settings: AppSettings,
  signal?: AbortSignal
) => {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI(
    { apiKey, httpOptions: { baseUrl: settings.customEndpoint || 'https://undyapi.com' } }
  );

  // Filter out thought parts from history
  const cleanHistory = history.map(item => {
    if (item.role === 'model') {
      return {
        ...item,
        parts: item.parts.filter(p => !p.thought)
      };
    }
    return item;
  }).filter(item => item.parts.length > 0);

  const currentUserContent = constructUserContent(prompt, images);
  const contentsPayload = [...cleanHistory, currentUserContent];

  try {
    // If signal is aborted before we start, throw immediately
    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const response = await ai.models.generateContent({
      model: getModelByResolution(settings),
      contents: contentsPayload,
      config: {
        ...(settings.isPro ? {
          imageConfig: {
            imageSize: settings.resolution,
            ...(settings.aspectRatio !== 'Auto' ? { aspectRatio: settings.aspectRatio } : {}),
          },
          tools: settings.useGrounding ? [{ googleSearch: {} }] : [],
        } : {}),
        responseModalities: ["TEXT", "IMAGE"],
        ...(settings.isPro && settings.enableThinking ? {
            thinkingConfig: {
                includeThoughts: true,
            }
        } : {}),
      },
    });

    if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
    }

    const candidate = response.candidates?.[0];
    if (!candidate || !candidate.content || !candidate.content.parts) {
      throw new Error("No content generated.");
    }

    const modelParts = await processSdkParts(candidate.content.parts, settings.enableCdnImageProcessing);

    return {
      userContent: currentUserContent,
      modelParts: modelParts
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    throw formatGeminiError(error);
  }
};
