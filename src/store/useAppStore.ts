import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import { get as getVal, set as setVal, del as delVal } from 'idb-keyval';
import { fetchBalance, BalanceInfo } from '../services/balanceService';
import { AppSettings, ChatMessage, Part, ImageHistoryItem } from '../types';
import { createThumbnail } from '../utils/imageUtils';

// Custom IndexedDB storage
const storage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    return await getVal(name) || null;
  },
  setItem: async (name: string, value: string): Promise<void> => {
    await setVal(name, value);
  },
  removeItem: async (name: string): Promise<void> => {
    await delVal(name);
  },
};

interface AppState {
  apiKey: string | null;
  settings: AppSettings;
  messages: ChatMessage[]; // Single Source of Truth
  imageHistory: ImageHistoryItem[]; // 图片历史记录
  isLoading: boolean;
  isSettingsOpen: boolean;
  inputText: string; // Global input text state
  balance: BalanceInfo | null;
  installPrompt: any | null; // PWA Install Prompt Event

  setInstallPrompt: (prompt: any) => void;
  setApiKey: (key: string) => void;
  fetchBalance: () => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addMessage: (message: ChatMessage) => void;
  updateLastMessage: (parts: Part[], isError?: boolean, thinkingDuration?: number) => void;
  addImageToHistory: (image: ImageHistoryItem) => Promise<void>;
  deleteImageFromHistory: (id: string) => Promise<void>;
  clearImageHistory: () => Promise<void>;
  cleanInvalidHistory: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setInputText: (text: string) => void;
  toggleSettings: () => void;
  clearHistory: () => void;
  removeApiKey: () => void;
  deleteMessage: (id: string) => void;
  sliceMessages: (index: number) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      apiKey: null,
      settings: {
        resolution: '1K',
        aspectRatio: 'Auto',
        useGrounding: false,
        enableThinking: true,
        streamResponse: true,
        customEndpoint: 'https://undyapi.com',
        modelName: 'gemini-3-pro-image-preview',
        theme: 'system',
        isPro: true,
        sendWithModifier: false, // 默认 Enter 发送
        enableCdnImageProcessing: true, // 默认启用 CDN 图片处理
      },
      messages: [],
      imageHistory: [], // 初始化图片历史记录
      isLoading: false,
      isSettingsOpen: window.innerWidth > 640, // Open by default only on desktop (sm breakpoint)
      inputText: '',
      balance: null,
      installPrompt: null,

      setInstallPrompt: (prompt) => set({ installPrompt: prompt }),
      setApiKey: (key) => set({ apiKey: key }),

      fetchBalance: async () => {
        const { apiKey, settings } = get();
        if (!apiKey) return;
        try {
          const balance = await fetchBalance(apiKey, settings);
          set({ balance });
        } catch (error) {
          console.error('Failed to update balance:', error);
        }
      },
      
      updateSettings: (newSettings) => 
        set((state) => ({ settings: { ...state.settings, ...newSettings } })),

      addMessage: (message) => 
        set((state) => ({ 
          messages: [...state.messages, message],
        })),

      updateLastMessage: (parts, isError = false, thinkingDuration) =>
        set((state) => {
            const messages = [...state.messages];

            if (messages.length > 0) {
                messages[messages.length - 1] = {
                    ...messages[messages.length - 1],
                    parts: [...parts], // Create a copy to trigger re-renders
                    isError: isError,
                    ...(thinkingDuration !== undefined && { thinkingDuration })
                };
            }

            return { messages };
        }),

      addImageToHistory: async (image) => {
        // 分离存储：生成缩略图存入 State，原图存入 IDB
        let thumbnail = image.thumbnailData;
        if (!thumbnail && image.base64Data) {
            try {
                thumbnail = await createThumbnail(image.base64Data, image.mimeType);
            } catch (e) {
                console.error('Failed to create thumbnail', e);
            }
        }

        // 如果有原图数据，存入 IDB 并从 State 对象中移除
        if (image.base64Data) {
            try {
                await setVal(`image_data_${image.id}`, image.base64Data);
            } catch (e) {
                console.error('Failed to save image data to IDB', e);
            }
        }

        const newImageItem: ImageHistoryItem = {
            ...image,
            thumbnailData: thumbnail,
            base64Data: undefined // 不在 State 中存储原图
        };

        set((state) => {
          // 最多保留100张图片
          const newHistory = [newImageItem, ...state.imageHistory].slice(0, 100);
          
          // 如果超出了100张，需要清理被移除图片的 IDB 数据
          if (state.imageHistory.length >= 100) {
              const removed = state.imageHistory[99];
              if (removed) {
                  delVal(`image_data_${removed.id}`).catch(console.error);
              }
          }
          
          return { imageHistory: newHistory };
        });
      },

      deleteImageFromHistory: async (id) => {
        // 清理 IDB 数据
        try {
            await delVal(`image_data_${id}`);
        } catch (e) {
            console.error('Failed to delete image data from IDB', e);
        }

        set((state) => ({
          imageHistory: state.imageHistory.filter((img) => img.id !== id),
        }));
      },

      clearImageHistory: async () => {
        const { imageHistory } = get();
        // 清理所有图片的 IDB 数据
        for (const img of imageHistory) {
            try {
                await delVal(`image_data_${img.id}`);
            } catch (e) {
                console.error(`Failed to delete image data ${img.id}`, e);
            }
        }
        set({ imageHistory: [] });
      },

      cleanInvalidHistory: async () => {
        const { imageHistory } = get();
        let hasChanges = false;
        
        const newHistoryPromises = imageHistory.map(async (img) => {
            // Case 1: 已经是新格式 (有缩略图)
            if (img.thumbnailData) {
                 // 如果还有 base64Data，顺手清理并确保 IDB 有数据
                 if (img.base64Data) {
                     try {
                         await setVal(`image_data_${img.id}`, img.base64Data);
                     } catch (e) { console.error(e); }
                     
                     hasChanges = true;
                     return { ...img, base64Data: undefined };
                 }
                 return img;
            }

            // Case 2: 旧格式 (无缩略图，有 base64Data) -> 迁移
            if (!img.thumbnailData && img.base64Data) {
                hasChanges = true;
                try {
                    // 1. 生成缩略图
                    const thumbnail = await createThumbnail(img.base64Data, img.mimeType);
                    // 2. 存入 IDB
                    await setVal(`image_data_${img.id}`, img.base64Data);
                    
                    // 3. 返回新结构
                    return {
                        ...img,
                        thumbnailData: thumbnail,
                        base64Data: undefined
                    } as ImageHistoryItem;
                } catch (e) {
                    console.error(`Failed to migrate image ${img.id}`, e);
                    // 迁移失败，可能数据坏了，返回 null 标记删除
                    return null; 
                }
            }

            // Case 3: 坏数据 (无缩略图，无 base64Data) -> 删除
            hasChanges = true;
            // 尝试清理残留 IDB
            try {
                await delVal(`image_data_${img.id}`);
            } catch (e) {}
            return null;
        });

        const processedHistory = await Promise.all(newHistoryPromises);
        const validHistory = processedHistory.filter((img): img is ImageHistoryItem => img !== null);

        if (hasChanges || validHistory.length !== imageHistory.length) {
            set({ imageHistory: validHistory });
        }
      },

      setLoading: (loading) => set({ isLoading: loading }),
      
      setInputText: (text) => set({ inputText: text }),
      
      toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

      clearHistory: () => set({ messages: [] }),

      removeApiKey: () => set({ apiKey: null }),

      deleteMessage: (id) =>
        set((state) => {
          const index = state.messages.findIndex((m) => m.id === id);
          if (index === -1) return {};

          const newMessages = [...state.messages];
          newMessages.splice(index, 1);

          return { messages: newMessages };
        }),

      sliceMessages: (index) =>
        set((state) => ({
          messages: state.messages.slice(0, index + 1),
        })),
    }),
    {
      name: 'gemini-pro-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        apiKey: state.apiKey,
        settings: state.settings,
        imageHistory: state.imageHistory, // 持久化图片历史记录
      }),
    }
  )
);
