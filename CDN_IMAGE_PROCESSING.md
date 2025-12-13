# CDN 图片处理功能说明

## 概述

此功能为 UndyDraw 应用添加了对中转站 CDN 图片的支持。当使用某些中转站时，响应中的图片会以 Markdown 格式嵌入文本中（如 `![image](https://cdn-url.png)`），此功能会自动检测并下载这些图片，转换为标准的 Base64 格式。

## 功能特性

### 🔍 自动检测
- 自动识别文本中的 Markdown 格式图片链接
- 支持常见的图片 CDN 域名
- 智能判断图片 URL 有效性

### 📥 批量下载
- 并发下载多个图片（默认并发数：3）
- 10秒超时保护
- 支持常见图片格式（jpg, png, gif, webp, svg）

### 🔄 格式转换
- 将 CDN 图片转换为 Base64 格式
- 保持原始 MIME 类型
- 与现有 inlineData 格式完全兼容

### ⚡ 性能优化
- 流式响应中实时处理
- 文本缓冲机制，避免不完整的 URL
- 错误时回退到原始文本

### 🛡️ 错误处理
- 下载失败时保留原始 Markdown 文本
- 网络超时处理
- 详细的错误日志记录

## 配置选项

### AppSettings 新增字段

```typescript
interface AppSettings {
  // ... 其他设置
  enableCdnImageProcessing: boolean; // 是否启用 CDN 图片处理
}
```

### 默认值
- `enableCdnImageProcessing: true` - 默认启用

## 使用方法

### 1. 启用/禁用功能
在设置面板中切换"CDN 图片处理"开关。

### 2. 检测的 URL 格式
支持以下格式的 Markdown 图片链接：
```markdown
![alt text](https://example.com/image.jpg)
![图片](https://cdn.googlecdn.datas.systems/xxx.png)
```

### 3. 支持的 CDN 域名
- `googlecdn.datas.systems`
- `cdn.google.com`
- `storage.googleapis.com`
- `lh3.googleusercontent.com`
- 以及任何包含 `image` 关键词的 URL

## 技术实现

### 核心工具函数

#### `parseMarkdownImages(text: string)`
从文本中解析 Markdown 图片链接。

#### `isValidImageUrl(url: string)`
验证 URL 是否为有效的图片 URL。

#### `downloadImageAsBase64(url: string)`
下载图片并转换为 Base64 格式。

#### `batchDownloadImages(urls: string[])`
批量并发下载多个图片。

#### `containsCdnImages(text: string)`
检查文本是否包含 CDN 图片。

### 服务层集成

#### 流式响应处理
在 `streamGeminiResponse` 中：
- 缓冲文本直到检测到完整的图片 URL
- 异步下载并转换图片
- 实时更新显示内容

#### 非流式响应处理
在 `generateContent` 中：
- 批量处理所有包含 CDN 图片的文本
- 一次性转换所有图片

## 错误处理策略

### 下载失败
- 保留原始 Markdown 文本
- 记录错误日志
- 继续处理其他图片

### 网络超时
- 10秒超时保护
- 自动回退到原始文本
- 不影响其他内容的处理

### 格式错误
- URL 验证失败时跳过
- 保持文本完整性
- 提供详细错误信息

## 性能考虑

### 内存使用
- 及时释放 Blob URL
- 控制并发下载数量
- 优化 Base64 转换

### 网络请求
- 并发下载提高效率
- 超时控制防止阻塞
- User-Agent 设置避免被拒绝

### 用户体验
- 实时显示处理进度
- 错误时优雅降级
- 不中断现有功能

## 测试建议

### 测试用例
1. 标准中转站响应格式
2. 多图片混合文本
3. 无效 URL 处理
4. 网络超时场景
5. 禁用功能时的行为

### 手动测试
1. 使用支持 CDN 的中转站
2. 上传图片并观察处理过程
3. 检查图片是否正确下载和显示
4. 验证错误处理机制

## 维护说明

### 更新 CDN 域名
在 `isValidImageUrl` 函数中添加新的域名：
```typescript
const knownImageDomains = [
  'googlecdn.datas.systems',
  // 添加新域名
];
```

### 调整并发数
修改 `batchDownloadImages` 调用的并发参数：
```typescript
batchDownloadImages(urls, 5) // 增加到 5
```

### 超时设置
调整下载超时时间：
```typescript
downloadImageAsBase64(url, 15000) // 15秒超时
```

## 兼容性

- ✅ 完全向后兼容
- ✅ 标准 Gemini API 响应不受影响
- ✅ 可随时启用/禁用
- ✅ 错误时自动降级

此功能确保了应用在各种中转站环境下的兼容性，同时保持了原有的功能和性能。