---
name: http-access
description: 无浏览器实体的 HTTP(S) 网络访问技能。Use when an agent needs lightweight network requests such as public web pages, JSON APIs, RSS, sitemap, metadata checks, redirects, static HTML extraction, or file downloads without browser interaction.
allowed-tools: Bash
---

# http-access

通过非浏览器方式执行 HTTP(S) 请求。这个技能只描述自己的能力，不感知、不协调其他网络技能；是否安装或启用由 Agent Profile / skill 开关决定。

## 职责边界

本技能负责：

1. 普通 HTTP(S) 请求：`GET` / `POST` / `PUT` / `PATCH` / `DELETE`
2. `HEAD` 状态检查、content-type、content-length、最终 URL
3. JSON API 请求与解析
4. 静态 HTML 获取与轻量 metadata / 链接抽取
5. RSS、sitemap、公开文本资源获取
6. 文件下载到指定输出路径

本技能不负责：

- 浏览器实体、Chrome、CDP、页面 target
- 浏览器登录态、cookie profile、当前页面状态
- 点击、输入、滚动、截图、上传文件
- 复杂前端 JS 渲染后的 DOM
- CAPTCHA、Cloudflare challenge、真人浏览器指纹模拟

## 执行方式

统一调用脚本：

```bash
node /app/.pi/skills/http-access/scripts/http_access.mjs <command> --url <url>
```

Windows 项目目录调试：

```bash
node .pi/skills/http-access/scripts/http_access.mjs <command> --url <url>
```

## 子命令

### request

通用请求，输出状态、响应头和正文预览。

```bash
node .pi/skills/http-access/scripts/http_access.mjs request \
  --url "https://example.com" \
  --method GET \
  --header "accept: text/html" \
  --max-bytes 1048576
```

### json

请求并解析 JSON。

```bash
node .pi/skills/http-access/scripts/http_access.mjs json \
  --url "https://api.github.com/repos/nodejs/undici"
```

### html

获取 HTML，输出标题、描述和正文预览。

```bash
node .pi/skills/http-access/scripts/http_access.mjs html \
  --url "https://example.com"
```

### extract

从静态 HTML 中抽取标题、描述、canonical、链接列表和正文候选。

```bash
node .pi/skills/http-access/scripts/http_access.mjs extract \
  --url "https://example.com" \
  --limit 20
```

### head

检查 URL 状态、重定向后的最终地址、content-type、content-length。

```bash
node .pi/skills/http-access/scripts/http_access.mjs head \
  --url "https://example.com"
```

### download

下载文件。默认不覆盖已有文件；需要覆盖时加 `--overwrite`。

```bash
node .pi/skills/http-access/scripts/http_access.mjs download \
  --url "https://example.com/file.pdf" \
  --out "workspace/output/file.pdf"
```

## 参数速查

| 参数 | 说明 | 默认 |
| --- | --- | --- |
| `--url` | HTTP(S) URL | 必填 |
| `--method` | 请求方法 | `GET` |
| `--header` | 请求头，可重复，格式 `name: value` | 无 |
| `--body` | 请求体文本 | 无 |
| `--timeout-ms` | 超时毫秒 | `15000` |
| `--max-bytes` | 最大读取字节数 | `5242880` |
| `--limit` | `extract` 链接数量 | `20` |
| `--out` | `download` 输出路径 | 必填 |

## 输出要求

- 对用户说明请求 URL、HTTP 状态、content-type 和关键结果。
- JSON / HTML 抽取结果可以直接引用脚本输出，但不要把未验证的网页正文包装成事实结论。
- 失败时保留状态码、错误消息和正文预览，便于继续排查。

## 错误做法

- 用本技能声称完成浏览器登录态访问。
- 用本技能承诺点击、滚动、截图或读取当前浏览器页面。
- 在 `403`、验证码、JS 空壳页面上反复重试轰炸目标站点。
- 下载大文件时不设置合理路径或不关注响应大小。
