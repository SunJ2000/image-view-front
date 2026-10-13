# 拾光网站手动部署（Windows 打包 → 上传 → Xshell 解压）

根据你提供的服务器环境说明：Ubuntu、宿主机 Nginx、SSH 为 `root@106.14.136.223:22`，使用 Xshell 操作。后端目录是 `/opt/image-view-backend`，Docker 后端通过宿主机 `127.0.0.1:3000` 提供服务；Nginx 生效的站点文件是 `/etc/nginx/conf.d/image-view.conf`。这些信息来自交接说明，本次没有 SSH 登录或修改服务器。

采用手动部署：本地生成静态文件，手动上传，在 Xshell 解压。前端和 `/api/` 共用现有 Nginx 的 80 端口；前端部署不涉及后端 Compose、数据库或 `.env`。

| 用途 | 服务器路径 |
| --- | --- |
| 上传前端包 | `/tmp/image-view-front.tar.gz` |
| 上传新版站点配置（首次部署时） | `/tmp/image-view.conf` |
| 网页静态目录 | `/var/www/image-view-front/dist` |
| Nginx 生效配置 | `/etc/nginx/conf.d/image-view.conf` |

## 1. 在 Windows 本地打包

打开 PowerShell：

```powershell
cd D:\Code\image-view\image-view-front
npm ci
npm run package:deploy
```

`npm ci` 在首次准备环境或依赖变化后执行即可。`package:deploy` 会先运行正式构建，再把结果压缩到桌面的 `image-view-front-deploy` 文件夹：

```text
image-view-front-deploy/
├── image-view-front.tar.gz   # 里面只有 dist/ 前端静态文件
├── image-view.conf           # 已合并前端静态服务的 Nginx 配置
└── DEPLOY.md                 # 本说明
```

`npm run build` 只生成项目里的 `dist`；`npm run package:deploy` 额外生成方便上传的压缩包。压缩包不含源码、node_modules、后端 .env 或管理令牌。Linux 上不需要安装 Node.js、npm 或运行 `npm run dev`。

如果本机执行策略禁止运行 `.ps1`，也可以手动运行以下命令打包：

```powershell
cd D:\Code\image-view\image-view-front
npm run build
tar -czf image-view-front.tar.gz dist
```

此时上传项目根目录生成的压缩包，以及 `deploy/nginx.conf.example`（上传后命名为 `image-view.conf`）。

## 2. 从 Windows 上传到 Linux

用你现有的 SFTP 上传工具（例如 Xftp、WinSCP），连接 `106.14.136.223`，用户名 `root`，SSH 端口 `22`，打开远程 `/tmp` 目录。首次部署上传桌面 `image-view-front-deploy` 文件夹里的两个文件：

| 本地文件 | 上传后的服务器路径 |
| --- | --- |
| `image-view-front.tar.gz` | `/tmp/image-view-front.tar.gz` |
| `image-view.conf` | `/tmp/image-view.conf` |

其中配置文件要使用本次前端打包文件夹里的版本，它已包含网页静态目录与路由回退。

然后在 Xshell 登录服务器，继续第 3 步。也可以不用上传软件，改为在本地 PowerShell 手动执行 SCP：

```powershell
$serverUser = 'root'
$deployDirectory = Join-Path ([Environment]::GetFolderPath('Desktop')) 'image-view-front-deploy'
scp "$deployDirectory\image-view-front.tar.gz" "${serverUser}@106.14.136.223:/tmp/image-view-front.tar.gz"
scp "$deployDirectory\image-view.conf" "${serverUser}@106.14.136.223:/tmp/image-view.conf"
ssh "${serverUser}@106.14.136.223"
```

按你的 SSH 配置使用密码或密钥；首次连接时核对服务器指纹。SSH 端口不是 22 时，`scp` 加 `-P 你的端口`，`ssh` 加 `-p 你的端口`。

两种上传方式任选一种即可，上传的都是同一份静态包。

## 3. 在 Linux 上解压前端

以下命令是在 Xshell 登录 Ubuntu 服务器后执行，不是在 Windows PowerShell 中执行。前端静态目录与 Nginx 配置中的 `root` 一致：

```bash
sudo install -d -m 755 /var/www/image-view-front
sudo tar -xzf /tmp/image-view-front.tar.gz -C /var/www/image-view-front
sudo find /var/www/image-view-front/dist -type d -exec chmod 755 {} \;
sudo find /var/www/image-view-front/dist -type f -exec chmod 644 {} \;
ls -l /var/www/image-view-front/dist/index.html
```

最后应看到 `index.html` 文件。注意不能多套一层目录：正确路径是 `/var/www/image-view-front/dist/index.html`。

## 4. 替换现有 Nginx 站点配置

首次部署前端时执行一次。服务器说明记录的生效路径是 `/etc/nginx/conf.d/image-view.conf`，先备份再安装新版：

```bash
sudo cp /etc/nginx/conf.d/image-view.conf /etc/nginx/conf.d/image-view.conf.bak.$(date +%Y%m%d-%H%M%S)
sudo install -m 644 /tmp/image-view.conf /etc/nginx/conf.d/image-view.conf
sudo nginx -t && sudo systemctl reload nginx
```

只在 `nginx -t` 成功时才重载。替换同一个站点文件，不要保留两个同域名的 `server` 配置。备份名不以 `.conf` 结尾，避免被常见的 `*.conf` 配置规则重复加载。

如果实际配置路径不在这里，先运行 `sudo nginx -T` 找到当前生效的站点文件，替换上面命令中的路径。若你线上已额外配置 HTTPS，应保留证书、443 监听和跳转配置，只合并提供文件中的静态目录与 `location`；这份完整文件基于你提供的 HTTP 版本。

新配置的关键行为：

- `/` 读取 `/var/www/image-view-front/dist` 下的页面和静态文件。
- `/admin`、`/admin/login`、`/photos/:id` 回退到 `index.html`，由前端路由处理。
- `/api/` 继续代理到 `http://127.0.0.1:3000`，保留 `/api/` 前缀；`proxy_pass` 地址末尾不要加 `/`。
- `/assets/` 的带版本号资源长期缓存，缺失资源返回 404；页面 HTML 每次重新验证缓存。

## 5. 验证访问

在 Linux 上执行：

```bash
curl -I http://127.0.0.1/ -H 'Host: sunj2000.com'
curl -I http://127.0.0.1/admin/login -H 'Host: sunj2000.com'
curl http://127.0.0.1/api/health -H 'Host: sunj2000.com'
```

前两项应返回 `200` 和 HTML 类型，最后一项应返回后端健康状态 JSON。再用自己的浏览器打开：

- 图库：[http://sunj2000.com/](http://sunj2000.com/)
- 管理平台：[http://sunj2000.com/admin](http://sunj2000.com/admin)
- IP 访问：[http://106.14.136.223/](http://106.14.136.223/)

管理页输入你在服务器后端配置的 `ADMIN_API_TOKEN`，不加 `Bearer`。管理令牌不需要写入前端构建配置。正式使用管理员功能时请为域名配置 HTTPS。

图库没有图片时，先在管理平台上传一张图片，上传完成后把“私有”切换为“公开”。环境说明记录域名此前受到备案拦截，本次没有重新核实备案状态；若域名仍被拦截，先通过 IP 验证网站，域名接入问题需在云平台处理。

## 以后更新前端

第一次完成后，以后修改前端代码，只需要以下三步：

1. 在本地 PowerShell 执行 `npm run package:deploy`。
2. 将桌面生成的 `image-view-front.tar.gz` 手动上传并覆盖 `/tmp/image-view-front.tar.gz`。
3. 在 Xshell 执行：

```bash
sudo tar -xzf /tmp/image-view-front.tar.gz -C /var/www/image-view-front
sudo find /var/www/image-view-front/dist -type d -exec chmod 755 {} \;
sudo find /var/www/image-view-front/dist -type f -exec chmod 644 {} \;
```

然后刷新浏览器即可。站点目录不变时不用再次上传/替换 Nginx 配置，不用重载 Nginx，也不用重启后端。直接覆盖解压会保留旧版带哈希的资源，方便尚未刷新页面的用户继续访问；确认不再使用旧版本后再按发布策略清理。

需要恢复原始 Nginx 配置时，把第 4 步生成的某份备份复制回原配置路径，再执行 `sudo nginx -t && sudo systemctl reload nginx`。
