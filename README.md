# 拾光 · Image View

Vue 3 + TypeScript + Vite 实现的图片预览网站，包含公开图库与管理员工作台，共用 `image-view-backend`。访客访问 `/`，管理员访问 `/admin`（未验证时跳转 `/admin/login`）。

## 本地运行

```sh
npm install
npm run dev
```

访问终端给出的本地地址。开发服务器默认把 `/api` 代理到 `http://106.14.136.223`；正式构建默认请求同源 `/api`，不固定服务器 IP。

正式版始终使用相对路径 `/api`，自动跟随当前页面的协议、域名和端口：从 `http://sunj2000.com` 打开时请求 `http://sunj2000.com/api/...`，从 `http://106.14.136.223` 打开时请求 `http://106.14.136.223/api/...`。不需要为正式站点填写 API 域名。开发代理只是为本地 `localhost:5173` 连接远端后端，不影响正式部署。

真实模式直接读取后端公开接口；没有已发布图片时会显示空图库。未部署公开接口或接口不可用时会显示错误提示。无需真实图片即可查看完整界面和交互的示例模式：

```sh
npm run dev:demo
```

示例模式明确显示“示例预览”，使用 Unsplash 的公开示例图片，不读取或修改真实文件。图片名称、大小和日期也都是示例数据；示例下载打开图片来源。`npm run build` 使用生产模式，不会启用示例图库，也不会在接口异常时自动回退到示例数据。

## 功能

- 公开图片列表、按名称搜索、分页、舒展/紧凑排列。
- 按可见区域懒加载，预览地址请求最多同时 4 个；临近过期或图片失败时重新申请地址。
- 点击打开大图，独立 `/photos/:id` 地址支持刷新和分享。
- 大图支持当前页上一张/下一张、方向键切换、Esc 关闭、缩放、查看尺寸、下载原图、复制页面链接。
- 手机和平板布局；原生对话框管理焦点，尊重系统减少动画设置。
- 加载骨架、空图库、搜索无结果、接口异常、图片失效和不支持在线预览的格式都有对应状态。
- 管理平台：管理令牌验证、文件搜索与状态/类型/可见性筛选、分页、预览、下载、重命名、删除、公开/私有切换。
- 多文件上传队列、进度、取消和重试；自动适配后端签名 PUT 或 STS 分片上传，上传成功后默认私有。

后端暂不生成缩略图，所以列表显示的是 OSS 原图的缩放版本。懒加载可以减少请求量，但不能减少单张原图的传输体积；后续可配合后端缩略图接口优化。

## 接口与配置

复制 `.env.example` 为 `.env.local` 可覆盖配置：

```dotenv
API_PROXY_TARGET=http://106.14.136.223
VITE_DEMO_MODE=false
```

`API_PROXY_TARGET` 仅供本地开发代理使用，不写入浏览器代码；无需配置即可使用默认 IP。访客图库请求不发送 Authorization；管理接口仅在运行时使用管理员输入的 Token。不要在源代码、`.env`、`VITE_*` 或构建产物中填写管理令牌和 OSS 永久密钥。示例图库仅允许在开发环境启用，正式构建始终读取真实接口；示例模式的管理平台仍连接配置的真实后端。

调用以下匿名接口：

| 接口                                                   | 用途                   |
| ------------------------------------------------------ | ---------------------- |
| `GET /api/public/photos?page=1&pageSize=24&search=...` | 分页和搜索             |
| `GET /api/public/photos/:id`                           | 图片详情及公开状态检查 |
| `GET /api/public/photos/:id/preview-url?mode=preview`  | 临时预览地址           |
| `GET /api/public/photos/:id/preview-url?mode=download` | 临时下载地址           |

先部署包含公开接口和 `visibility` 迁移的新版后端，再通过管理员接口发布至少一张已完成上传的图片。文件默认私有，因此数据库有文件也可能返回空图库。

管理员登录本项目 `/admin` 后，点击图片的“私有”按钮并确认公开，即可发布到访客图库。仅已入库图片支持公开；视频和其他文件仍可在后台管理。

## 管理员验证与上传

当前沿用后端已有的 `ADMIN_API_TOKEN`，没有账号密码、注册、JWT 签发或独立登录接口：

1. 管理员从服务器的后端环境变量中取得 `ADMIN_API_TOKEN`，在 `/admin/login` 输入完整值，不加 `Bearer` 前缀。
2. 前端携带 `Authorization: Bearer <输入值>` 请求 `GET /api/files?page=1&pageSize=1&status=ready`。后端校验通过并返回正常列表，才进入工作台。
3. 每次管理操作都携带 Token，后端 `AdminAuthGuard` 重新验证。前端路由拦截只负责页面体验，真正的权限在后端。
4. Token 仅保存在当前页面的内存中；不写入 localStorage、sessionStorage、Cookie 或 URL。刷新、关闭页面或点击退出后需要重新输入，收到 `401` 自动退出。退出仅清除本页凭证；要撤销旧 Token，需在服务器轮换 `ADMIN_API_TOKEN` 并重启后端。

正式管理应使用 HTTPS，避免在 HTTP 传输中暴露管理令牌。当前固定 Token 适合个人管理；后续账号密码登录需要新增后端认证接口，可再改为有过期时间的服务端会话。

上传依次调用 `/api/uploads/init`、浏览器直传 OSS、`/api/uploads/:id/complete`。前端不会拿到 OSS 永久密钥；STS 模式只使用后端签发的临时凭证，管理 Token 不会发送给 OSS。服务端签发的对象路径用于上传，完成后由服务端校验并入库。

本地 Vite 代理只转发 `/api`，上传文件仍由浏览器直接发送给 OSS。在 OSS 控制台进入 Bucket `image-sj` → 数据安全 → 跨域设置，按 [跨域规则模板](deploy/oss-cors.xml) 添加一条规则：来源包含 `http://127.0.0.1:5173`、`http://localhost:5173` 及正式页面来源；允许 `GET, HEAD, PUT, POST, DELETE`，允许 Headers 为 `*`，暴露 `ETag` 和 `x-oss-request-id` 等模板列出的响应头。来源的协议、域名、端口必须与页面一致，不带路径或末尾斜杠；配置 HTTPS 站点后加入实际 HTTPS 来源。保存后重新上传；只修改后端 `CORS_ORIGINS` 无法修复 OSS 上传跨域问题。模板供配置参考，不会自动应用到云端，Bucket 继续保持私有。操作参考 [阿里云 OSS 跨域配置](https://help.aliyun.com/zh/oss/user-guide/configure-cross-origin-resource-sharing)。

如果分片 PUT 返回 200，但任务仍失败，应检查该响应的 `Access-Control-Expose-Headers` 是否包含 `ETag`。OSS SDK 需要读取每个分片的 ETag 才能继续合并；浏览器开发者工具中能看见 ETag，不代表 JavaScript 有权读取它。若存在多条跨域规则，确保实际匹配的规则也配置了暴露 Headers；来源为 `*`、暴露 Headers 为空的备用规则可能使请求通过但仍然无法读取 ETag。允许 Headers 设为 `*`，可兼容 SDK 的 `x-oss-user-agent`、`Content-MD5` 等请求头。

失败重试会为同一上传记录申请新凭证；同页内 STS 分片尽可能续传。如果仅入库确认失败，重试只重新确认，不重复传输文件。刷新或退出会停止当前上传、丢失本页续传信息；可在“待上传”中清理遗留记录。单文件上限 5 GiB，实际限制以后端配置为准。OSS 需要允许页面来源及 PUT/分片上传所需的跨域请求，配置参考后端说明。

正式前后端同域时不需要跨域请求；跨域部署需配置后端 CORS。图片直接从 OSS 加载，OSS 配置沿用后端项目说明。图片撤回公开后，已签发的 OSS URL 可能继续有效至过期。

## 部署到 sunj2000.com

Windows 一键构建并生成上传包：

```sh
npm run package:deploy
```

会在桌面 `image-view-front-deploy` 文件夹生成前端 `.tar.gz`、与现有后端站点配置合并好的 `image-view.conf` 和操作说明。完整的本地打包、手动 SFTP/SCP 上传、Ubuntu/Xshell 解压、Nginx 首次配置及日后更新步骤见 [部署说明](deploy/DEPLOY.md)。服务器只需要宿主机 Nginx 提供静态文件，无需运行 Vite。

也可只构建静态文件：

```sh
npm run build
```

把 `dist` 文件夹上传到服务器，例如 `/var/www/image-view-front/dist`。将 [Nginx 示例](deploy/nginx.conf.example) 合并到域名现有的 server 配置中，调整静态目录，保留已有 HTTPS、证书和其他站点配置：

- `/` 提供前端静态页面。
- `/api/` 转发到 `127.0.0.1:3000`，实际后端端口不同时相应修改。
- 前端路由回退到 `index.html`，保证图片详情与 `/admin/login` 等链接刷新可用。
- `/assets/` 带版本号的构建资源长期缓存，HTML 使用 `no-cache`。

检查配置后重载 Nginx：

```sh
sudo nginx -t
sudo systemctl reload nginx
```

本次开发未修改服务器或进行线上部署。

## 验证

```sh
npm test
npm run build
```

测试覆盖公开接口、预览缓存和并发控制，以及管理员身份验证、退出/失效、请求权限、签名直传、STS 分片和上传重试。管理操作使用本地测试数据验收，不会修改线上文件；真实管理及 OSS 上传需管理员在页面输入自己的 Token 后验证。
