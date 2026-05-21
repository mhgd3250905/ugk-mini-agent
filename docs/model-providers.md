# 模型源管理

更新时间：`2026-05-21`

模型源只在 `runtime/pi-agent/models.json` 登记。用户在 Web 里选择的默认 API 源 / 模型属于运行态偏好：生产通过 `UGK_MODEL_SETTINGS_PATH=/app/.data/agent/model-settings.json` 保存到 shared 数据目录；仓库里的 `.pi/settings.json` 只作为首次启动或运行态文件缺失时的 bundled 默认值。不要把 provider、model、API key 和运行时策略混在一个地方，否则后面加模型会变成猜谜。

当前有效口径以本文件、`runtime/pi-agent/models.json` 和运行时 `/v1/model-config` 为准。`docs/change-log.md` 里的旧发布记录只用于追溯，当它们提到 `deepseek-anthropic`、DeepSeek `openai-completions`、`ANTHROPIC_AUTH_TOKEN` 作为智谱 key、或从 `*-api.txt` 注入 key 时，均视为历史事实，不是当前配置依据。

## 当前来源

| 来源 | provider | 模型 | 集群 | Key |
| --- | --- | --- | --- | --- |
| 智谱 | `zhipu-glm` | `glm-5.1` | `cn` | `ZHIPU_GLM_API_KEY` |
| DeepSeek | `deepseek` | `deepseek-v4-pro` / `deepseek-v4-flash` | `global` | `DEEPSEEK_API_KEY` |
| 小米 | `xiaomi-mimo-cn` | `mimo-v2.5-pro` | `cn` | `XIAOMI_MIMO_API_KEY` |
| 小米 | `xiaomi-mimo-sgp` | `mimo-v2.5-pro` | `sgp` | `XIAOMI_MIMO_API_KEY` |
| 小米 | `xiaomi-mimo-ams` | `mimo-v2.5-pro` | `ams` | `XIAOMI_MIMO_API_KEY` |
| 阿里 CodePlan | `ali-codeplan` | `glm-5.1` / `kimi-k2.6` / `deepseek-v4-pro` | `cn-beijing` | `ALI_CODEPLAN_API_KEY` |

阿里 CodePlan 下不同模型的上下文窗口不同：`glm-5.1` 为 `20000`，`kimi-k2.6` 为 `256000`，`deepseek-v4-pro` 为 `1000000`。不要因为同一个 provider 共用 endpoint，就把这三个模型的上下文长度写成同一个值。

## 小米集群验证记录

- `2026-04-29`：在腾讯云新加坡 `ugk-pi` 容器内真实 POST 验证三套小米 endpoint。
- `xiaomi-mimo-cn` 返回 `200`，当前 key 可用。
- `xiaomi-mimo-sgp` 返回 `401 Invalid API Key`，endpoint 可达，但当前 key 不具备该集群权限。
- `xiaomi-mimo-ams` 返回 `401 Invalid API Key`，endpoint 可达，但当前 key 不具备该集群权限。
- 结论：不要把 SGP / AMS 误判成网络不通；当前问题是 key 的区域权限。腾讯云新加坡如需走 `xiaomi-mimo-sgp`，需要向小米侧获取或开通对 SGP 集群有效的 API key。

## 配置规则

- `provider.id` 是稳定机器标识，不随展示文案改名。
- `provider.vendor` 表示来源：`zhipu`、`deepseek`、`xiaomi`。
- `provider.region` 表示集群或区域。
- `provider.priority` 控制 Web 模型源下拉展示顺序。
- `provider.name` 是给用户看的名称，前端优先展示它，再附带 provider id。
- `model.contextWindow` 用真实上下文窗口。DeepSeek V4 Pro / Flash 当前登记为 `1000000`，小米 `mimo-v2.5-pro` 当前登记为 `1048576`。
- 智谱 GLM 当前走 `anthropic-messages` 链路和 `https://open.bigmodel.cn/api/anthropic`，模型登记为 `glm-5.1`，使用独立 `ZHIPU_GLM_API_KEY` 并通过 `authHeader: true` 发送 `Authorization: Bearer <key>`；不要复用 Anthropic SDK 的全局 `ANTHROPIC_AUTH_TOKEN`。
- DeepSeek 当前按正式模型 registry 走 `anthropic-messages` 链路和 `https://api.deepseek.com/anthropic`，模型登记为 `deepseek-v4-pro` / `deepseek-v4-flash`。不要在 Team 或后台任务里按厂商名硬编码 OpenAI-compatible；调用协议以 provider 的 `api` 字段为准。
- 阿里 CodePlan 当前登记为 `ali-codeplan`，走 `anthropic-messages` 链路和 `https://token-plan.cn-beijing.maas.aliyuncs.com/apps/anthropic`，模型为 `glm-5.1` / `kimi-k2.6` / `deepseek-v4-pro`，上下文窗口分别为 `20000` / `256000` / `1000000`，使用独立 `ALI_CODEPLAN_API_KEY`。本地说明文件 `阿里codeplan-api-2026-5.txt` 只允许在 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true` 时作为开发 bootstrap 辅助读取，不是正式配置源。
- API key 的正式来源是环境变量。仓库根目录的 `zhipu-api.txt`、`deepseek-api.txt`、`小米api.txt` 这类本地文件只允许作为开发者临时说明；只有显式设置 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true` 时，`getAppConfig()` 才会把它们作为本地开发 bootstrap 辅助读取。正常 Docker / 生产运行不要打开这个开关，更不能把这些文件作为 provider/model/api 的正式数据源。
- `ANTHROPIC_AUTH_TOKEN` 只允许作为 Anthropic SDK / Anthropic 官方源自己的认证变量，不是项目级多 provider 公共 token。智谱、DeepSeek、小米这些 Anthropic-compatible provider 都必须使用自己的 env var，避免同进程 worker 被旧全局 token 污染。
- `GET /v1/model-config` 和后台 conn worker 的默认模型解析都读取同一个有效 settings：优先 `UGK_MODEL_SETTINGS_PATH`，缺失时回退 `.pi/settings.json`。保存默认选择时只写有效 settings 路径，不改仓库默认文件。
- Team Runtime 的 LLM 调用也必须读取同一套 registry/settings：项目默认 provider/model/api 是什么，Team 就用什么。Team 不读取任何 `*-api.txt` 作为配置源。

## 防误判清单

- 看到 `deepseek-anthropic`：这是旧 provider id，只允许作为历史 conn snapshot alias 兼容；新配置不要再写它。
- 看到 DeepSeek `openai-completions`：这是旧口径；当前 DeepSeek 正式路径是 `anthropic-messages`。
- 看到 `https://api.deepseek.com` 不带 `/anthropic`：这是旧 OpenAI-compatible baseUrl；当前 DeepSeek Anthropic-compatible baseUrl 是 `https://api.deepseek.com/anthropic`。
- 看到 `ANTHROPIC_AUTH_TOKEN` 被用来驱动智谱、DeepSeek 或小米：这是污染风险，不是规范配置。
- 看到 `*-api.txt`：默认只当本地临时说明文件。除非显式设置 `UGK_ALLOW_LOCAL_API_TXT_BOOTSTRAP=true`，否则运行时不会读取。

## 修改入口

- 模型注册：`runtime/pi-agent/models.json`
- 生产默认选择运行态：`/app/.data/agent/model-settings.json`
- 仓库 bundled 默认：`.pi/settings.json`
- key 兜底加载：`src/config.ts`
- Web API：`GET /v1/model-config`
- Web 设置入口：playground 的“模型源设置”
