# 前端部署到 /image-view/

访问地址：

- 图库：http://106.14.136.223/image-view/
- 管理平台：http://106.14.136.223/image-view/admin
- 管理登录：http://106.14.136.223/image-view/admin/login

Vite 的 base 已设置为 /image-view/，Vue Router 使用同一基准路径。API 继续请求根路径 /api/。

## 本地打包

在项目目录执行 npm run package:deploy。桌面 image-view-front-deploy 文件夹中包含 image-view-front.tar.gz、image-view.conf 和本说明。压缩包包含 dist/，不含源码、依赖或服务器密钥。

## 上传静态文件

使用 Xftp 将项目 dist 文件夹内的全部内容上传到 /opt/image-view-front/。正确目录结构：

/opt/image-view-front/index.html
/opt/image-view-front/favicon.svg
/opt/image-view-front/assets/

不要多套一层 dist。也可以上传压缩包到 /tmp/image-view-front.tar.gz，然后在服务器执行：

~~~bash
sudo install -d -m 755 /opt/image-view-front
sudo tar -xzf /tmp/image-view-front.tar.gz -C /opt/image-view-front --strip-components=1
sudo find /opt/image-view-front -type d -exec chmod 755 {} \;
sudo find /opt/image-view-front -type f -exec chmod 644 {} \;
ls -l /opt/image-view-front/index.html
~~~

## 替换 Nginx 配置

上传生成的 image-view.conf 到 /tmp/image-view.conf。这是基于现有 HTTP 配置的完整站点文件，替换现有配置即可：

~~~bash
sudo cp /etc/nginx/conf.d/image-view.conf /etc/nginx/conf.d/image-view.conf.bak.$(date +%Y%m%d-%H%M%S)
sudo install -m 644 /tmp/image-view.conf /etc/nginx/conf.d/image-view.conf
sudo nginx -t && sudo systemctl reload nginx
~~~

/image-view 自动跳转到 /image-view/。管理页面和图片详情路由回退到 index.html；带哈希资源长期缓存，缺失资源返回 404；/api/ 保留原代理。

## 验证

~~~bash
curl -I http://106.14.136.223/image-view/
curl -I http://106.14.136.223/image-view/admin/login
curl http://106.14.136.223/api/health
~~~

浏览器访问管理登录页，并刷新页面检查路由。上传文件、公开图片后检查图库。

以后更新前端只需重新打包并上传静态文件或解压压缩包，路径不变时无需再次修改 Nginx。
