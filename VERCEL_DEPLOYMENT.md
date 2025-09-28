# Vercel 部署指南

## 配置说明

本项目已经配置了完整的 `vercel.json` 文件，包含了以下关键配置：

### 1. 构建配置 (builds)
- `server.js` - 使用 `@vercel/node` 构建器处理 Node.js 后端服务
- `public/**` - 使用 `@vercel/static` 构建器处理静态文件

### 2. 路由配置 (routes)
- 所有请求 `/(.*)` 都会被路由到 `server.js` 处理
- 这样可以确保 Express 应用的所有 API 端点都能正常工作

### 3. 函数配置 (functions)
- 设置最大执行时间为 30 秒
- 适用于需要处理数据库操作的 API 请求

### 4. 环境变量 (env)
- `SECRET_KEY` - 用于身份验证的密钥
- `MD5_HASH` - 用于验证的 MD5 哈希值

## 部署步骤

### 1. 安装 Vercel CLI
```bash
npm i -g vercel
```

### 2. 登录 Vercel
```bash
vercel login
```

### 3. 配置环境变量
在 Vercel 控制台或使用 CLI 设置环境变量：
```bash
vercel env add SECRET_KEY
vercel env add MD5_HASH
```

### 4. 部署项目
```bash
vercel --prod
```

## API 端点

部署后，以下 API 端点将可用：

- `GET /` - 主页，返回 index.html
- `GET /api/health` - 健康检查（需要认证）
- `POST /api/book` - 保存书籍内容（需要认证）
- `POST /api/sync` - 同步阅读进度（需要认证）
- `GET /api/sync/:bookId` - 获取阅读进度（需要认证）

注意：API 端点现在可以通过 `/api/*` 和直接 `/*` 两种路径访问，提供了更好的兼容性。

## 认证机制

所有 API 端点（除了根路径）都需要在请求头中包含认证令牌：
```
Authorization: Bearer your-token-here
```

服务器会使用 `SECRET_KEY` 和 `MD5_HASH` 验证令牌的有效性。

## 注意事项

1. **数据库**: 项目使用 SQLite，但在 Vercel 的无服务器环境中，每次调用都可能使用新的实例。建议：
   - 考虑使用 Vercel Postgres 或其他云数据库
   - 或者将数据库文件存储在持久化存储中

2. **文件大小限制**: Vercel 对请求大小有限制，大文件上传可能需要特殊处理

3. **冷启动**: 无服务器函数可能有冷启动延迟，首次访问可能较慢

4. **环境变量**: 确保在 Vercel 控制台正确设置所有必需的环境变量