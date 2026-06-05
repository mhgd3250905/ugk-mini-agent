# 本地 Docker 与运行态防踩坑

这份文档给本地开发和排障用。目标不是把所有 Docker 命令背一遍，而是避免在 `ugk-pi` 这个项目里反复踩同几个坑。

如果你只记一句：本项目本地标准启动方式是 `docker compose up -d`，先确认当前 compose、端口和挂载，再决定是 `restart`、`up --build` 还是重建容器。别凭感觉拧开关。

## 不要用宿主机 npm 当标准启动入口

`npm start` / `npm run dev` 可以作为非常短的源码排障手段，但不是本项目的正规运行方式。直接在 Windows 宿主机用 npm 启服务，很容易绕过这些真实运行条件：

- Docker Chrome sidecar 与 CDP 端口。
- `ugk-pi-conn-worker` / `ugk-pi-feishu-worker`。
- `/var/lib/ugk-pi/conn/conn.sqlite` 和 `.data/` 运行态挂载。
- `PUBLIC_BASE_URL`、`WEB_ACCESS_BROWSER_PUBLIC_BASE_URL`、`WEB_ACCESS_CDP_HOST` 等 compose 环境变量。
- 容器内 `/app` 路径、upload 桥和浏览器共享目录。

所以本地验证默认只认：

```bash
docker compose up -d
docker compose restart ugk-pi
docker compose restart ugk-pi ugk-pi-conn-worker ugk-pi-feishu-worker
```

宿主机 `npm` 命令用于 `npm install`、`npm test`、`npm run build`、`npx tsc --noEmit` 这类开发检查。拿它长期启动服务，环境异常是迟早的事，不是玄学。

## 先确认你在哪种运行模式

本地默认入口：

```bash
http://127.0.0.1:3000/playground
http://127.0.0.1:3000/healthz
```

先看真实状态：

```bash
docker compose ps
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker compose config
```

本地 `docker-compose.yml` 目前把仓库挂到容器 `/app`：

```yaml
volumes:
  - .:/app
  - /app/node_modules
```

所以在标准本地开发 compose 下，很多 `src/`、`.pi/skills/`、`runtime/skills-user/`、`scripts/` 改动会通过 bind mount 进入容器。但别机械套用这句话：

- 如果容器是从生产 compose / prod image / 旧 compose 状态创建的，可能不是同一套挂载。
- 如果改了 `Dockerfile`、`package*.json`、系统依赖或镜像内安装内容，必须重建。
- 如果新增技能或修改启动期配置，重启 app 更稳，因为运行时可能有模板缓存、进程内 registry 或已加载模块。

## 共享 Python 依赖运行态

Chat、Conn worker 和 Team worker 的 agent bash 环境现在共用同一个 Python venv。compose 会把宿主目录 `${UGK_RUNTIME_DEPS_HOST_DIR:-./.data/runtime-deps}` 挂到容器 `/app/.runtime-deps`，并把 `/app/.runtime-deps/python-venv-linux/bin` 放到 `PATH` 最前面。

实际效果：

- agent 直接运行 `python`、`pip` 或 `pip install ...` 时，命中的是共享 venv，不需要自己判断当前来自 Chat、Conn 还是 Team。
- venv 初始化会加目录锁，避免 Chat / Conn / Team 同时启动时把半初始化的 Python 环境当成可用环境。
- `pip install` / `pip uninstall` 通过 venv 内的 wrapper 自动串行化，并在成功后刷新 `/app/.runtime-deps/python-requirements.lock`，用于排查和交接。
- `npm run runtime:check` 会初始化并检查这套共享 Python runtime，输出 venv、python、pip 和 lockfile 状态。
- 宿主机直接跑 `npm run runtime:check` 时会使用平台专属 venv，例如 Windows 是 `.data/runtime-deps/python-venv-win32`；Docker 内固定使用 `python-venv-linux`，避免宿主 venv 污染容器。是的，跨 OS 硬共用一个 venv 这种想法很诱人，也很离谱。
- `.data/runtime-deps` 是运行态缓存，不属于 Git。重建镜像不会清掉它；真要清理 Python 依赖，需要明确处理该目录。

排障时别犯低级错：`docker compose exec ugk-pi which python` 查到的是新开的临时 shell，不一定等于正在运行的 Node / agent 子进程环境。要确认 agent 实际会继承什么，优先看服务启动日志里的 `runtime python ready`，或读取容器内真实 Node 进程的 `/proc/<pid>/environ`；当前真实服务进程应包含 `PATH=/app/.runtime-deps/python-venv-linux/bin:...`。

这套机制只解决 Python 包。`ffmpeg`、`libreoffice`、`tesseract`、`poppler` 这类系统工具仍然属于镜像依赖，必须进 `Dockerfile`，然后执行 `docker compose up --build -d ...`。别指望一个 venv 能把系统二进制凭空变出来。

## 选择正确动作

### 只重启 app

适合：

- 本地 bind mount 已确认存在。
- 只改了运行时代码、项目级 skill、用户 skill、脚本或文档。
- 没改依赖、Dockerfile、compose、端口、系统包。

命令：

```bash
docker compose restart ugk-pi
```

如果改了后台任务或 worker 相关逻辑，也重启 worker：

```bash
docker compose restart ugk-pi ugk-pi-conn-worker ugk-pi-feishu-worker
```

### Team Console 5174 仍显示旧 UI

Team Console dev server 是单独的 `ugk-pi-team-console` 容器，入口是：

```bash
http://127.0.0.1:5174/
```

如果宿主机源码和容器 `/app` 都已经是新代码，但 `5174` 页面仍显示旧交互，别急着重启主后端。先直接查 Vite 返回的源码模块有没有新标记：

```bash
curl http://127.0.0.1:5174/src/graph/ExecutionMap.tsx
curl http://127.0.0.1:5174/src/app/App.tsx
```

例如 Team Console PR #6 合并后，新代码应能在 `ExecutionMap.tsx` 里看到 `onToggleTaskGroupLock`、`lockedTaskGroupNodeIdSet`、`data-task-group-locked`。如果容器内文件有这些标记，但 `5174` 返回没有，说明 Vite dev server 的 transformed module / module graph 卡旧了。只重启 Team Console：

```bash
docker compose restart ugk-pi-team-console
```

重启后再硬刷新浏览器。不要为这个问题重启 `ugk-pi`、`ugk-pi-team-worker`，更不要开临时端口绕过 `5174`。这是前端 dev server 运行态缓存，不是后端 API 或 Git 没合上。

### 重建 app / worker

适合：

- 改了 `Dockerfile`、`package.json`、`package-lock.json`。
- 当前容器明显不是按本地 bind mount 创建的。
- `restart` 后容器里仍看不到新文件或新代码。
- 需要模拟生产镜像行为。

命令：

```bash
docker compose up --build -d ugk-pi ugk-pi-conn-worker ugk-pi-feishu-worker
```

如果构建卡在 Debian `apt-get update` 或系统包下载，先在 `.env` 里设置 `APT_MIRROR_HOST=mirrors.aliyun.com` 后再重建；本地和生产 compose 都会把这个 build arg 透传给 `Dockerfile`。

如果端口映射异常或容器是在端口冲突时创建的，释放端口后强制重建 app 容器：

```bash
docker compose up -d --force-recreate ugk-pi
```

### 不要默认重启 nginx

本地开发入口通常由 `ugk-pi` 自己发布 `3000:3000`。如果你看到 `ugk-pi-nginx-1`，先判断它是不是旧的 orphan 容器：

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker logs --tail 80 ugk-pi-nginx-1
```

如果日志里有：

```text
host not found in upstream "ugk-pi"
```

通常说明这个 nginx 不在当前 compose 网络里，或者是旧项目形态遗留的 orphan。不要把它当成标准入口继续修。先停掉它释放 `3000`：

```bash
docker stop ugk-pi-nginx-1
docker compose up -d --force-recreate ugk-pi
```

然后确认端口由 `ugk-pi` 发布：

```text
ugk-pi-ugk-pi-1 ... 0.0.0.0:3000->3000/tcp
```

生产环境另说：生产 compose 有正式 nginx，更新 app 后通常要重启 nginx。生产只看 `docs/server-ops.md`，别拿本地 orphan nginx 经验去服务器上乱套。

## 启动后必须验真实入口

容器 `healthy` 只说明容器自己的 healthcheck 过了，不等于宿主入口、nginx、技能清单、runtime 挂载都没问题。

至少验证：

```bash
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/v1/debug/runtime
curl http://127.0.0.1:3000/v1/debug/skills
```

如果刚新增项目级技能，例如 `.pi/skills/conn-maintenance/SKILL.md`，要确认：

```bash
curl http://127.0.0.1:3000/v1/debug/skills
```

返回里能看到目标技能名。只看到文件存在不算加载成功。

## 端口 3000 排障

先跑端口 doctor：

```bash
npm run docker:doctor
```

它会检查本机 `3000` 监听者，尤其是 Windows 上 `127.0.0.1:3000` 被宿主机 `node.exe` 单独监听、同时 Docker backend 也发布 `0.0.0.0:3000` 的情况。这个状态下浏览器访问 `http://127.0.0.1:3000` 会优先命中宿主机 Node，而不是 Docker 里的 `ugk-pi`。典型症状是容器 healthy、Docker 里 key 已经设置，但页面仍显示“密钥未配置”或旧 UI。别再先怀疑模型源，先把影子进程停掉。

先看谁占端口：

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
netstat -ano | findstr ":3000"
```

常见情况：

- `ugk-pi-ugk-pi-1` 发布 `0.0.0.0:3000->3000/tcp`：本地入口应该直连 app。
- `127.0.0.1:3000` 另有宿主机 `node.exe` 监听：它会遮住 Docker 发布的 `0.0.0.0:3000`，需要停掉宿主机 dev server，或用管理员 PowerShell `taskkill /PID <pid> /T /F`。
- `ugk-pi-nginx-1` 发布 `0.0.0.0:3000->80/tcp`：确认它是不是当前 compose 的正式 nginx；本地大概率是 orphan。
- `ugk-pi-ugk-pi-1` 只有 `3000/tcp` 没有宿主映射：容器创建时端口被占了，释放端口后 `--force-recreate ugk-pi`。

别只看 `docker compose ps`。它可能看不到 orphan 容器，而 orphan 正好占着端口。这个坑又小又烦，但杀伤力很稳定。

## Conn SQLite 不要乱删

本地默认 conn SQLite 路径是 named volume：

```text
/var/lib/ugk-pi/conn/conn.sqlite
```

运行态 API / 技能里常见路径是：

```text
/app/.data/agent/conn/conn.sqlite
```

先以当前 `/v1/debug/runtime` 和容器环境为准，不要猜。

看到 SQLite 报错时，不要第一反应删库。先看：

```bash
docker compose logs --tail 160 ugk-pi
docker compose exec -T ugk-pi sh -lc "env | grep -E 'CONN_DATABASE_PATH|UGK_AGENT_DATA_DIR' || true"
docker compose exec -T ugk-pi sh -lc "ls -lh /var/lib/ugk-pi/conn /app/.data/agent/conn 2>/dev/null || true"
```

Windows / Docker Desktop bind mount 下，`PRAGMA journal_mode = WAL` 可能因为 `-wal` / `-shm` 侧文件支持问题失败。当前代码会对已知 WAL 不可用错误降级到 DELETE journal mode。不要为了让它启动去删 `conn.sqlite`，那是在用数据献祭启动成功率，工程上很寒碜。

旧事件清理只能走：

```bash
node scripts/maintain-conn-db.mjs --db <conn.sqlite> --keep-days 7 --keep-latest-runs-per-conn 3 --dry-run --json
```

或者让运行时 Agent 使用 `conn-maintenance` 技能。正式清理前必须先 dry-run、汇报影响、等待用户确认。

## 运行态目录边界

别把这几个目录混成一坨：

| 路径 | 作用 | 规则 |
| --- | --- | --- |
| `.pi/skills/` | 项目级系统技能 | 可随代码提交，影响主 Agent 系统能力 |
| `runtime/skills-user/` | 用户技能 | 本地开发可在仓库；生产通过 shared 持久挂载 |
| `.codex/skills/` | 维护本仓库的 coding agent 技能 | 不是 Playground 运行时技能 |
| `.data/agent/` | 主 Agent session、assets、conn 等运行态 | 不属于代码更新内容 |
| `.data/agents/` | 自定义 agent profile 运行态 | 创建 / 归档走 API，不手写 `profiles.json` |
| `.data/chrome-sidecar*` | Chrome sidecar 登录态 | 不删、不覆盖、不上传到生产覆盖 |

提交前看：

```bash
git status --short
```

不要提交：

- `.env`
- key / token
- `.data/`
- `.claude/`
- `runtime/xhs-extract.mjs`
- 临时报告、截图、打包产物

如果某些文件是用户或同事的未提交改动，不要顺手格式化、重写或提交。协作项目里最烦的不是 bug，是“我顺手帮你整理了一下”。

## 浏览器绑定红线

Agent / Conn 浏览器绑定已经收口为 Playground UI 手动设置：

- Agent 自然语言不能改 Chrome。
- Conn 自然语言不能改 `browserId`。
- 运行时只消费 `defaultBrowserId` / `browserId`。
- 脚本直接调 CDP proxy 时，浏览器变更类请求必须带 `metaAgentScope`。

如果旧脚本裸调：

```text
http://127.0.0.1:3456/session/navigate
http://127.0.0.1:3456/new
```

并遇到 `missing_agent_scope`，正确修法是从运行环境读取 `CLAUDE_AGENT_ID` / `CLAUDE_HOOK_AGENT_ID` / `agent_id`，把 scope 作为 `metaAgentScope` 传给代理。不要硬编码 `chrome-01`、`chrome-02` 或 `default`。

## 模型源与 key

模型源注册和真实 key 是两层东西：

- provider / model 展示顺序看 `docs/model-providers.md`、`runtime/pi-agent/models.json` 和相关配置代码。
- 真实 key 只放运行态环境、ignored 本地文件或服务器 shared 配置。
- 改模型源后至少测 `/v1/model-config`。
- 当前智谱、DeepSeek、小米都不是用 `ANTHROPIC_AUTH_TOKEN` 当公共 key。智谱使用 `ZHIPU_GLM_API_KEY`，DeepSeek 使用 `DEEPSEEK_API_KEY`，小米使用 `XIAOMI_MIMO_API_KEY`。
- 当前 DeepSeek 正式走 `anthropic-messages` 和 `https://api.deepseek.com/anthropic`。如果看到旧文档或旧快照里写 `deepseek-anthropic`、OpenAI-compatible 或不带 `/anthropic` 的 baseUrl，先按历史兼容理解，不要直接照抄回当前配置。
- 仓库根目录的 `zhipu-api.txt`、`deepseek-api.txt`、`小米api.txt` 这类文件默认不是运行配置源。只有 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true` 时本地开发会读取它们；正常 Docker 和生产都应保持 `false`。
- 改了 `.env` 或模型源相关 env 后，至少重建或重启会创建 agent session 的进程：`ugk-pi`、`ugk-pi-conn-worker`、`ugk-pi-team-worker`。只重启主服务而忘了 worker，后台任务会继续拿旧环境，刚刚的 DeepSeek 401 假成功就是这种低级坑，难看但很真实。

不要提交 `.claude/`、本地 key settings、`.env` 或任何 token。把 key 混进 Git，不叫交付，叫埋雷。

## 本地和生产命令不要混用

本地：

```bash
docker compose up -d
docker compose restart ugk-pi
docker compose up --build -d ugk-pi ugk-pi-conn-worker ugk-pi-feishu-worker
```

阿里云生产：

```bash
docker compose --env-file /root/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml ...
```

腾讯云生产：

```bash
docker compose --env-file /home/ubuntu/ugk-claw-shared/compose.env -p ugk-pi-claw -f docker-compose.prod.yml ...
```

生产增量更新优先：

```bash
npm run server:ops -- aliyun preflight
npm run server:ops -- aliyun deploy
npm run server:ops -- aliyun verify
```

或：

```bash
npm run server:ops -- tencent preflight
npm run server:ops -- tencent deploy
npm run server:ops -- tencent verify
```

生产不要 `docker compose down -v`，不要删 shared，别拿本地临时修法去服务器上赌。

## 快速决策表

| 现象 | 先做什么 | 不要做什么 |
| --- | --- | --- |
| 页面还是旧 UI | 查 `/playground` 是否返回新标记，再决定 restart / rebuild | 开临时端口逃避 3000 |
| `healthz` 不通 | `docker ps` 看端口，再看 `docker compose logs --tail 160 ugk-pi` | 只盯容器 healthy |
| 3000 被占 | 找占用容器，判断是否 orphan nginx | 盲目重启 nginx |
| app 启动 SQLite 报错 | 查 DB 路径、挂载、日志和 WAL 降级 | 删除 `conn.sqlite` |
| 新技能看不到 | 查 `/v1/debug/skills`，必要时重启 app | 只看文件存在 |
| 改了依赖或 Dockerfile | `up --build -d` | 只 `restart` |
| 生产要更新 | 走 `server:ops` 和 shared 备份口径 | 手工覆盖目录或 reset |
