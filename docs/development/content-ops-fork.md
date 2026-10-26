# 内容工作台 Fork：固定版本上的聊天成果预览修复

本分支从 OpenAkita `1.27.42`，提交 `5f5b38da728274f0fd06461a481851be7c0bca6a` 开始，未升级后端。`origin` 指向维护者的 Fork，`upstream` 跟踪官方仓库；修复分支为 `content-ops/1.27.42`，基线标签为 `content-ops-base-1.27.42`。

## 用户现在怎样查看成果

聊天中的 `/workspace/...` 文件链接会调用认证文件 API。图片在弹窗中查看，HTML 在隔离框中运行，其他文件可以下载；HTML 附件卡片也支持预览。登录失效和文件缺失分别显示重新登录、文件已移动的提示。

HTML 弹窗的目标结构如下；头尾控制区固定，作品区域独立滚动：

```text
┌ 文件名                                      [关闭] ┐
├───────────────────────────────────────────────────┤
│  图片 / 隔离 HTML / 加载状态 / 错误及重试             │
│  HTML 保留自身脚本、指针与键盘交互                    │
├───────────────────────────────────────────────────┤
│  隔离预览 · 仅加载内嵌资源                    [下载]  │
└───────────────────────────────────────────────────┘
```

HTML 预览只加载文件内嵌的脚本、样式和资源。外部依赖不会加载；需要联网的页面应下载后在适当环境中查看。预览不获得同源存储、弹窗、表单提交或父页面导航权限；其唯一宿主消息能力是关闭自己的预览。下载得到原始文件，不包含预览隔离包装。

来源标签在共享 Markdown 解析管线中转换为徽标。行内代码和代码块保留字面文本，例如 `` `[来源:工具]` `` 不会被改成 HTML。聊天历史无需重写。

## 构建与回归

在 `apps/setup-center/` 执行；本次使用 Node.js 24：

```sh
npm ci
npm run test:run -- \
  src/views/chat/components/__tests__/SourceBadge.markdown.test.tsx \
  src/views/chat/components/__tests__/MarkdownContent.files.test.tsx \
  src/views/chat/utils/__tests__/workspaceFiles.test.ts \
  src/components/__tests__/FileAttachmentCard.preview.test.tsx \
  src/platform/__tests__/fileDownloads.test.ts
npx tsc --noEmit
VITE_BUILD_ID=1.27.42 npm run build:web
```

Web 构建产物在 `apps/setup-center/dist-web/`。本分支不包含服务器配置、模型密钥、会话或内容任务数据。现有内容工作台的 Docker/SSH 登录、插件 Bridge 与侧栏兼容补丁仍由独立业务部署仓库维护；部署时应从本分支的确定提交构建前端，并继续应用这些部署补丁，不能直接用官方镜像覆盖定制前端。

## 跟进上游时保留明确差异

先取得官方 `main` 的目标提交，在新的升级候选分支合并，检查哪些修复已被上游吸收，再运行回归与实际浏览器验收。不要在正式服务目录直接拉取最新 `main`，也不要把本分支强推到 Fork 的 `main`。

升级至少验证：来源徽标及代码示例、认证图片和下载、HTML 指针/键盘交互及隔离、桌面和手机弹窗、原生登录、内容插件导航。构建通过后，部署仍需独立授权和恢复点。模型配置只通过 OpenAkita 原生界面管理，前端修复不要求重建模型配置或迁移任务库。
