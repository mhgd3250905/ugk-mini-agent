# 模型源管理

更新时间：`2026-06-13`

`ugk-mini-agent` 的模型源是运行态数据。全新安装后没有任何 provider，也没有默认可用 API key。

## 用户流程

1. 启动本机服务：`npm run native:start`
2. 打开 `http://127.0.0.1:8888/playground/model-sources`
3. 点击“新增 API 源”
4. 填写 Provider ID、Base URL、API Key 和模型列表
5. 在同页把全局默认、Agent 或 Conn 绑定到新增的 provider/model

新增的 provider 写入 `.data/agent/model-providers.json`。默认模型选择写入 `.data/agent/model-settings.json`。这两个文件都是本机运行态数据，不进入版本库。

## API 合同

- `GET /v1/model-sources`：返回用户已添加的 provider，以及全局、Agent、Conn 的有效绑定。
- `POST /v1/model-sources/providers`：新增 provider，接收 `apiKey`，响应不会回显明文 key。
- `PATCH /v1/model-sources/usages/:usageKind/:usageId`：修改绑定，`usageKind` 支持 `global`、`agent`、`conn`。
- `GET /v1/model-config`：返回当前默认选择和用户已添加的 provider。
- `POST /v1/model-config/validate`：用选中的 provider/model 发起一次低成本连通性验证。

当前开放的 provider 协议是 `anthropic-messages`。

## 运行态文件

- `.data/agent/model-providers.json`：用户新增 provider 和本地 API key。
- `.data/agent/effective-models.json`：派生给 agent runtime 使用的有效模型 registry。
- `.data/agent/model-settings.json`：当前默认 provider/model。
- `runtime/pi-agent/models.json`：项目内置模板，不作为全新运行态的默认 provider 列表。

## Provider 示例

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "vendor": "deepseek",
  "region": "global",
  "baseUrl": "https://api.deepseek.com/anthropic",
  "api": "anthropic-messages",
  "apiKey": "sk-...",
  "models": [
    {
      "id": "deepseek-v4-flash",
      "name": "DeepSeek V4 Flash",
      "contextWindow": 1000000,
      "maxTokens": 384000
    }
  ]
}
```
