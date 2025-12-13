import React, { useEffect, useState, Suspense } from 'react';
import { useAppStore } from './store/useAppStore';
import { useUiStore } from './store/useUiStore';
import { AppSettings } from './types';
import { ChatInterface } from './components/ChatInterface';
import { ToastContainer } from './components/ui/ToastContainer';
import { GlobalDialog } from './components/ui/GlobalDialog';
import { formatBalance } from './services/balanceService';
import { Settings, Sun, Moon, Github, ImageIcon, DollarSign, Download, Sparkles } from 'lucide-react';
import { lazyWithRetry, preloadComponents } from './utils/lazyLoadUtils';

// Lazy load components
const ApiKeyModal = lazyWithRetry(() => import('./components/ApiKeyModal').then(module => ({ default: module.ApiKeyModal })));
const SettingsPanel = lazyWithRetry(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })));
const ImageHistoryPanel = lazyWithRetry(() => import('./components/ImageHistoryPanel').then(module => ({ default: module.ImageHistoryPanel })));
const PromptLibraryPanel = lazyWithRetry(() => import('./components/PromptLibraryPanel').then(module => ({ default: module.PromptLibraryPanel })));

const App: React.FC = () => {
  const { apiKey, setApiKey, settings, updateSettings, isSettingsOpen, toggleSettings, imageHistory, balance, fetchBalance, installPrompt, setInstallPrompt } = useAppStore();
  const { togglePromptLibrary, isPromptLibraryOpen, showDialog, addToast } = useUiStore();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setInstallPrompt]);

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

  // Preload components after mount
  useEffect(() => {
    preloadComponents([
      () => import('./components/ApiKeyModal'),
      () => import('./components/SettingsPanel'),
      () => import('./components/ImageHistoryPanel'),
      () => import('./components/PromptLibraryPanel'),
      // Also preload components used in ChatInterface
      () => import('./components/ThinkingIndicator'),
      () => import('./components/MessageBubble'),
      // Preload Games
      () => import('./components/games/SnakeGame'),
      () => import('./components/games/DinoGame'),
      () => import('./components/games/LifeGame'),
      () => import('./components/games/Puzzle2048')
    ]);
  }, []);
  const [mounted, setMounted] = useState(false);
  const [isImageHistoryOpen, setIsImageHistoryOpen] = useState(false);

  useEffect(() => {
    setMounted(true);

    const params = new URLSearchParams(window.location.search);
    const urlApiKey = params.get('apikey');
    const urlEndpoint = params.get('endpoint');
    const urlModel = params.get('model');

    // 解析分辨率模型映射参数
    const urlResolutionModelMap: Record<string, string> = {};
    const resolutions = ['1K', '2K', '4K'] as const;
    resolutions.forEach(resolution => {
      const modelParam = params.get(`model_${resolution}`);
      if (modelParam) {
        urlResolutionModelMap[resolution] = modelParam;
      }
    });

    // Check if parameters are actually different from current settings
    const isDifferent =
        (urlApiKey && urlApiKey !== apiKey) ||
        (urlEndpoint && urlEndpoint !== settings.customEndpoint) ||
        (urlModel && urlModel !== settings.modelName) ||
        (Object.keys(urlResolutionModelMap).length > 0 &&
         JSON.stringify(urlResolutionModelMap) !== JSON.stringify(settings.resolutionModelMap || {}));

    if ((urlApiKey || urlEndpoint || urlModel || Object.keys(urlResolutionModelMap).length > 0) && isDifferent) {
        let message = "检测到 URL 中包含新的配置参数：\n\n";
        if (urlApiKey && urlApiKey !== apiKey) message += `- API Key: (已隐藏)\n`;
        if (urlEndpoint && urlEndpoint !== settings.customEndpoint) message += `- 接口地址: ${urlEndpoint}\n`;
        if (urlModel && urlModel !== settings.modelName) message += `- 模型: ${urlModel}\n`;

        // 添加分辨率模型映射参数
        Object.entries(urlResolutionModelMap).forEach(([resolution, model]) => {
            message += `- ${resolution}分辨率模型: ${model}\n`;
        });

        message += "\n是否应用这些设置？这将覆盖您当前的配置。";

        showDialog({
            type: 'confirm',
            title: '应用外部配置',
            message: message,
            confirmLabel: '应用并保存',
            onConfirm: () => {
                const newSettings: Partial<AppSettings> = {};
                if (urlEndpoint) newSettings.customEndpoint = urlEndpoint;
                if (urlModel) newSettings.modelName = urlModel;
                if (Object.keys(urlResolutionModelMap).length > 0) {
                    newSettings.resolutionModelMap = urlResolutionModelMap;
                }

                if (Object.keys(newSettings).length > 0) {
                    updateSettings(newSettings);
                }

                if (urlApiKey) {
                    setApiKey(urlApiKey);
                }

                // Clean up URL
                const newUrl = window.location.pathname;
                window.history.replaceState({}, '', newUrl);

                addToast('配置已更新', 'success');
            }
        });
    } else if (urlApiKey || urlEndpoint || urlModel || Object.keys(urlResolutionModelMap).length > 0) {
        // If parameters exist but are same as current, just clean up URL silently
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
    }
  }, [apiKey, settings.customEndpoint, settings.modelName, settings.resolutionModelMap, showDialog, updateSettings, setApiKey, addToast]);

  // Theme handling
  useEffect(() => {
    const root = window.document.documentElement;
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    const applyTheme = () => {
      const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemTheme.matches);
      if (isDark) {
        root.classList.add('dark');
        // Update theme-color for PWA/Browser bar
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#030712');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#030712');
      } else {
        root.classList.remove('dark');
        // Update theme-color for PWA/Browser bar
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: dark)"]')?.setAttribute('content', '#ffffff');
        document.querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')?.setAttribute('content', '#ffffff');
      }
    };

    applyTheme();
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  if (!mounted) return null;

  return (
    <div className="flex h-dvh w-full flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden relative transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 bg-white/50 dark:bg-gray-950/50 px-6 py-4 backdrop-blur-md z-10 transition-colors duration-200">
        <div className="flex items-center gap-3">
          <a 
            href="https://undyapi.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex h-10 w-10 items-center justify-center overflow-hidden hover:opacity-80 transition-opacity"
          >
             <img src="/logo.svg" alt="Logo" className="h-full w-full object-cover" />
          </a>
          <div className="hidden sm:block">
            <h1 className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">Nano Banana Pro</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              由 <a href="https://undyapi.com" target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 hover:underline transition-colors">Undy API</a> 赞助联合开发
            </p>
          </div>
        </div>
        
        {apiKey && (
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Balance Display - Desktop only */}
            {balance && (
                <div 
                    onClick={() => fetchBalance()}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-700 transition mr-2"
                    title="点击刷新余额"
                >
                    <DollarSign className="h-4 w-4 text-green-600 dark:text-green-500" />
                    <span className={balance.remaining < 1 ? "text-red-500" : ""}>
                        {formatBalance(balance.remaining, balance.isUnlimited)}
                    </span>
                </div>
            )}

            {installPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex rounded-lg p-2 text-purple-600 dark:text-purple-400 transition hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:text-purple-700 dark:hover:text-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                title="安装应用"
              >
                <Download className="h-6 w-6 animate-attract" />
              </button>
            )}

            <a
              href="https://github.com/faithleysath/UndyDraw"
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="GitHub 仓库"
            >
              <Github className="h-6 w-6 animate-heartbeat-mixed group-hover:animate-none" />
            </a>
            <button
              onClick={() => setIsImageHistoryOpen(true)}
              className="relative rounded-lg p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="图片历史"
            >
              <ImageIcon className="h-6 w-6" />
              {imageHistory.length > 0 && (
                <span className="absolute top-1 right-1 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
            </button>
            <button
              onClick={togglePromptLibrary}
              className={`rounded-lg p-2 transition focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                isPromptLibraryOpen
                  ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white'
              }`}
              title="提示词库"
            >
              <Sparkles className="h-6 w-6" />
            </button>
            <button
              onClick={() => updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
              className="rounded-lg p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="切换主题"
            >
              {settings.theme === 'dark' ? <Sun className="h-6 w-6" /> : <Moon className="h-6 w-6" />}
            </button>
            <button
              onClick={toggleSettings}
              className="rounded-lg p-2 text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="设置"
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-row">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatInterface />
        </div>

        {/* Settings Sidebar (Desktop/Mobile Overlay) */}
        <div 
          className={`
            absolute inset-0 z-20 flex justify-end
            transition-all duration-300 ease-in-out
            ${isSettingsOpen 
              ? 'bg-black/50 backdrop-blur-sm pointer-events-auto' 
              : 'bg-transparent backdrop-blur-none pointer-events-none'
            }
            
            sm:static sm:z-auto sm:bg-transparent sm:backdrop-blur-none sm:pointer-events-auto sm:overflow-hidden
            sm:transition-[width,border-color]
            ${isSettingsOpen 
              ? 'sm:w-80 sm:border-l sm:border-gray-200 dark:sm:border-gray-800' 
              : 'sm:w-0 sm:border-l-0 sm:border-transparent'
            }
          `}
          onClick={() => {
            // Close on backdrop click (mobile only)
            if (window.innerWidth < 640 && isSettingsOpen) {
               toggleSettings();
            }
          }}
        >
           <div 
             className={`
               w-full h-full sm:w-80 bg-white dark:bg-gray-950 
               shadow-2xl sm:shadow-none
               overflow-y-auto overflow-x-hidden border-l border-gray-200 dark:border-gray-800 sm:border-none
               
               transition-transform duration-300 ease-in-out
               ${isSettingsOpen ? 'translate-x-0' : 'translate-x-full'}
               sm:translate-x-0
             `}
             onClick={(e) => e.stopPropagation()}
           >
              <div className="p-4 w-full">
                <Suspense fallback={<div className="p-4 text-center text-gray-500">加载中...</div>}>
                  <SettingsPanel />
                </Suspense>
              </div>
           </div>
        </div>
      </main>

      {/* Modals */}
      <Suspense fallback={null}>
        {!apiKey && <ApiKeyModal />}
        {isImageHistoryOpen && (
          <ImageHistoryPanel isOpen={isImageHistoryOpen} onClose={() => setIsImageHistoryOpen(false)} />
        )}
        <PromptLibraryPanel />
      </Suspense>
      <ToastContainer />
      <GlobalDialog />
    </div>
  );
};

export default App;
