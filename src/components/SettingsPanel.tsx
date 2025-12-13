import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { useUiStore } from '../store/useUiStore';
import { X, LogOut, Trash2, Share2, Bookmark, DollarSign, RefreshCw, Download, Zap } from 'lucide-react';
import { formatBalance } from '../services/balanceService';

export const SettingsPanel: React.FC = () => {
  const { apiKey, settings, updateSettings, toggleSettings, removeApiKey, clearHistory, isSettingsOpen, fetchBalance, balance, installPrompt, setInstallPrompt } = useAppStore();
  const { addToast, showDialog } = useUiStore();
  const [loadingBalance, setLoadingBalance] = useState(false);
  
  const handleInstallClick = async () => {
    if (!installPrompt) return;
    
    // Show the install prompt
    installPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await installPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    // We've used the prompt, and can't use it again, throw it away
    setInstallPrompt(null);
  };
  
  // 首次加载或打开面板时如果没有余额数据，尝试获取
  useEffect(() => {
    if (apiKey && isSettingsOpen && !balance && !loadingBalance) {
        setLoadingBalance(true);
        fetchBalance().finally(() => setLoadingBalance(false));
    }
  }, [apiKey, isSettingsOpen, balance, fetchBalance]);

  const handleFetchBalance = async () => {
    if (!apiKey) {
      addToast("请先输入 API Key", 'error');
      return;
    }

    setLoadingBalance(true);
    try {
      await fetchBalance();
      addToast("余额查询成功", 'success');
    } catch (error: any) {
      addToast(`余额查询失败: ${error.message}`, 'error');
    } finally {
      setLoadingBalance(false);
    }
  };

  const getBookmarkUrl = () => {
    if (!apiKey) return window.location.href;
    const params = new URLSearchParams();
    params.set('apikey', apiKey);
    if (settings.customEndpoint) params.set('endpoint', settings.customEndpoint);
    if (settings.modelName) params.set('model', settings.modelName);

    // 添加分辨率模型映射参数
    if (settings.resolutionModelMap) {
      Object.entries(settings.resolutionModelMap).forEach(([resolution, model]) => {
        if (model.trim()) {
          params.set(`model_${resolution}`, model);
        }
      });
    }

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  };

  const handleCreateBookmark = () => {
    if (!apiKey) return;
    const url = getBookmarkUrl();
    
    // Update address bar without reloading
    window.history.pushState({ path: url }, '', url);

    // Copy to clipboard
    navigator.clipboard.writeText(url).then(() => {
        addToast("URL 已更新并复制！按 Ctrl+D 添加书签。", 'success');
    }).catch(err => {
        console.error("复制失败", err);
        showDialog({
            type: 'alert',
            title: '复制失败',
            message: `请手动复制此 URL：\n${url}`,
            onConfirm: () => {}
        });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">设置</h2>
        <button onClick={toggleSettings} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg sm:hidden">
          <X className="h-5 w-5 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      <div className="space-y-8 flex-1">
        {/* Balance Section */}
        {apiKey && (
          <section className="p-4 rounded-xl bg-linear-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">API 余额</h3>
              </div>
              <button
                onClick={handleFetchBalance}
                disabled={loadingBalance}
                className="p-1.5 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-800/30 text-blue-600 dark:text-blue-400 disabled:opacity-50 transition"
                title="刷新余额"
              >
                <RefreshCw className={`h-4 w-4 ${loadingBalance ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingBalance && !balance ? (
              <div className="text-sm text-gray-500 dark:text-gray-400 text-center py-3">
                查询中...
              </div>
            ) : balance ? (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">总额度</div>
                  <div className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatBalance(balance.hardLimitUsd, balance.isUnlimited)}
                  </div>
                </div>
                <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">已使用</div>
                  <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    {formatBalance(balance.usage, balance.isUnlimited)}
                  </div>
                </div>
                <div className="bg-white/50 dark:bg-gray-900/30 rounded-lg p-2.5 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">剩余</div>
                  <div className="text-sm font-bold text-green-600 dark:text-green-400">
                    {formatBalance(balance.remaining, balance.isUnlimited)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                点击刷新按钮查询余额
              </div>
            )}
          </section>
        )}

        {/* Pro Mode Toggle */}
        <section>
          <label className="flex items-center justify-between cursor-pointer group">
            <div className="flex items-center gap-2">
                <Zap className={`h-4 w-4 ${settings.isPro ? 'text-amber-500' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">Pro 模式</span>
            </div>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.isPro}
                onChange={(e) => updateSettings({ isPro: (e.target as HTMLInputElement).checked })}
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </div>
          </label>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            启用高级功能，包括高分辨率图像、Google 搜索定位和思考过程。
          </p>
        </section>

        {/* Pro Features Group */}
        {settings.isPro && (
          <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-300">
            {/* Resolution */}
            <section className="mb-4">
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">图像分辨率</label>
              <div className="grid grid-cols-3 gap-2">
                {(['1K', '2K', '4K'] as const).map((res) => (
                  <button
                    key={res}
                    onClick={() => {
                      if (res === '2K' || res === '4K') {
                        updateSettings({ resolution: res, streamResponse: false });
                      } else {
                        updateSettings({ resolution: res });
                      }
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
                      settings.resolution === res
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                        : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
            </section>

            {/* Aspect Ratio */}
            <section>
              <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">长宽比</label>
              <div className="grid grid-cols-3 gap-2">
                {(['Auto', '1:1', '3:4', '4:3', '9:16', '16:9'] as const).map((ratio) => {
                  const isActive = settings.aspectRatio === ratio;
                  const ratioPreviewStyles: Record<string, string> = {
                    'Auto': 'w-6 h-6 border-dashed',
                    '1:1': 'w-6 h-6',
                    '3:4': 'w-5 h-7',
                    '4:3': 'w-7 h-5',
                    '9:16': 'w-4 h-7',
                    '16:9': 'w-7 h-4',
                  };

                  return (
                    <button
                      key={ratio}
                      onClick={() => updateSettings({ aspectRatio: ratio })}
                      className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-3 transition ${
                        isActive
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900'
                      }`}
                    >
                      <div
                        className={`rounded-sm border-2 ${
                          isActive ? 'border-blue-400 bg-blue-100 dark:bg-blue-400/20' : 'border-gray-400 dark:border-gray-600 bg-gray-200 dark:bg-gray-800'
                        } ${ratioPreviewStyles[ratio]}`}
                      />
                      <span className="text-xs font-medium">{ratio}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Enable Resolution Model Mapping */}
            <section>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">分辨率专用模型</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={!!settings.resolutionModelMap}
                    onChange={(e) => {
                      const target = e.target as HTMLInputElement;
                      if (target.checked) {
                        // 初始化空的映射
                        updateSettings({ resolutionModelMap: {} });
                      } else {
                        // 禁用功能，删除映射
                        updateSettings({ resolutionModelMap: undefined });
                      }
                    }}
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                </div>
              </label>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                为不同分辨率设置专门的模型，覆盖默认模型设置
              </p>
            </section>

            {/* Resolution Model Mapping */}
            {settings.resolutionModelMap && (
              <section>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">分辨率专用模型</label>
                <div className="space-y-2">
                  {(['1K', '2K', '4K'] as const).map((res) => (
                    <div key={res} className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400 w-12">{res}:</span>
                      <input
                        type="text"
                        value={settings.resolutionModelMap[res] || ''}
                        onChange={(e) => {
                          const newMap = { ...settings.resolutionModelMap };
                          const target = e.target as HTMLInputElement;
                          if (target.value.trim()) {
                            newMap[res] = target.value.trim();
                          } else {
                            delete newMap[res];
                          }
                          updateSettings({ resolutionModelMap: newMap });
                        }}
                        placeholder={settings.modelName || "gemini-3-pro-image-preview"}
                        className="flex-1 px-3 py-1 text-sm border border-gray-200 dark:border-gray-800 rounded-md bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                  为不同分辨率设置专门的模型，留空则使用默认模型
                </p>
              </section>
            )}

            {/* Grounding */}
            <section>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">Google 搜索定位</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.useGrounding}
                    onChange={(e) => updateSettings({ useGrounding: (e.target as HTMLInputElement).checked })}
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                </div>
              </label>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                允许 Gemini 通过 Google 搜索获取实时信息。
              </p>
            </section>

            {/* Thinking Process */}
            <section>
              <label className="flex items-center justify-between cursor-pointer group">
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">显示思考过程</span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={settings.enableThinking}
                    onChange={(e) => updateSettings({ enableThinking: (e.target as HTMLInputElement).checked })}
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
                </div>
              </label>
              <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
                 显示模型的内部思考过程。对于不支持思考的模型（例如 gemini-2.5-flash-image / Nano Banana），请禁用此选项。
              </p>
            </section>
          </div>
        )}

        {/* Streaming */}
        <section>
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">流式响应</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.streamResponse}
                onChange={(e) => {
                  const checked = (e.target as HTMLInputElement).checked;
                  if (checked && (settings.resolution === '2K' || settings.resolution === '4K')) {
                    showDialog({
                        type: 'confirm',
                        title: '潜在问题',
                        message: "警告：2K 或 4K 分辨率配合流式传输可能会导致内容不完整。是否继续？",
                        confirmLabel: "仍然启用",
                        onConfirm: () => updateSettings({ streamResponse: true })
                    });
                  } else {
                    updateSettings({ streamResponse: checked });
                  }
                }}
                 className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </div>
          </label>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
             逐个 token 流式传输模型的响应。对于一次性响应请禁用。
          </p>
        </section>

        {/* Send Shortcut */}
        <section>
          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300">
              {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter 发送
            </span>
            <div className="relative">
              <input
                type="checkbox"
                checked={settings.sendWithModifier}
                onChange={(e) => updateSettings({ sendWithModifier: (e.target as HTMLInputElement).checked })}
                className="sr-only peer"
              />
              <div className="h-6 w-11 rounded-full bg-gray-200 dark:bg-gray-800 peer-focus:ring-2 peer-focus:ring-blue-500/50 peer-checked:bg-blue-600 transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full"></div>
            </div>
          </label>
          <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
            启用后需要按 {navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Enter 发送消息，Enter 键仅换行。适合使用中文输入法的用户。
          </p>
        </section>
        
        {/* App Installation */}
        {installPrompt && (
          <section className="pt-4 border-t border-gray-200 dark:border-gray-800 mb-4">
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 p-3 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/20 transition"
            >
              <Download className="h-4 w-4" />
              <span>安装 UndyDraw 应用</span>
            </button>
            <p className="mt-2 text-xs text-center text-gray-400 dark:text-gray-500">
              安装到您的设备以获得原生应用体验。
            </p>
          </section>
        )}

        {/* Share Configuration */}
        <section className="pt-4 border-t border-gray-200 dark:border-gray-800 mb-4">
           <div className="flex gap-2 mb-2">
             <button
               onClick={handleCreateBookmark}
               className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 p-3 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
             >
               <Share2 className="h-4 w-4" />
               <span className="text-xs sm:text-sm">更新 URL</span>
             </button>

             <a
               href={getBookmarkUrl()}
               onClick={(e) => e.preventDefault()} // Prevent navigation, strictly for dragging
               className="flex-1 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 p-3 text-gray-500 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-500 dark:hover:text-blue-400 cursor-grab active:cursor-grabbing transition text-sm font-medium"
               title="将此按钮拖动到书签栏"
             >
               <Bookmark className="h-4 w-4" />
               <span className="text-xs sm:text-sm">拖动到书签</span>
             </a>
           </div>
        </section>

        {/* Data Management */}
        <section className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <button
                onClick={() => {
                    showDialog({
                        type: 'confirm',
                        title: '清除历史记录',
                        message: "您确定要删除所有聊天记录吗？此操作无法撤销。",
                        confirmLabel: "清除",
                        onConfirm: () => {
                            clearHistory();
                            toggleSettings();
                            addToast("对话已清除", 'success');
                        }
                    });
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/5 p-3 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/10 transition mb-3"
            >
                <Trash2 className="h-4 w-4" />
                <span>清除对话</span>
            </button>

            <button
                onClick={() => {
                    showDialog({
                        type: 'confirm',
                        title: '移除 API Key',
                        message: "您确定要移除您的 API Key 吗？您的聊天记录将被保留。",
                        confirmLabel: "移除",
                        onConfirm: () => {
                            removeApiKey();
                            addToast("API Key 已移除", 'info');
                        }
                    });
                }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 p-3 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
                <LogOut className="h-4 w-4" />
                <span>清除 API Key</span>
            </button>
        </section>

        {/* Info */}
        <div className="mt-1 pb-4 text-center text-[10px] text-gray-400 dark:text-gray-600 space-y-1">
           <p>模型: {settings.modelName || 'gemini-3-pro-image-preview'}</p>
           <p className="truncate px-4">接口地址: {settings.customEndpoint || 'https://undyapi.com'}</p>
        </div>
      </div>
    </div>
  );
};
