export interface AppSettings {
  resolution: '1K' | '2K' | '4K';
  aspectRatio: 'Auto' | '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
  useGrounding: boolean;
  enableThinking: boolean;
  streamResponse: boolean;
  customEndpoint?: string;
  modelName?: string;
  theme: 'light' | 'dark' | 'system';
  isPro: boolean;
  sendWithModifier: boolean; // true: Cmd/Ctrl+Enter 发送, false: Enter 发送
  enableCdnImageProcessing: boolean; // 是否启用 CDN 图片处理
  resolutionModelMap?: Partial<Record<'1K' | '2K' | '4K', string>>; // 分辨率到模型的映射
}

export interface Part {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
  thought?: boolean;
  thoughtSignature?: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  parts: Part[];
  timestamp: number;
  isError?: boolean;
  thinkingDuration?: number;
}

export interface Attachment {
  file: File;
  preview: string; // Base64 for UI preview
  base64Data: string; // Raw base64 for API
  mimeType: string;
}

export interface ImageHistoryItem {
  id: string;
  mimeType: string;
  base64Data?: string; // Raw base64 for API (Optional if stored separately)
  thumbnailData?: string; // Base64 thumbnail
  prompt: string; // 生成图片的提示词
  timestamp: number;
  modelName?: string;
}

export interface PromptItem {
  title: string;
  preview: string;
  prompt: string;
  author: string;
  link: string;
  mode: 'edit' | 'generate';
  category: string;
}
