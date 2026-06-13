# 更新记录

更新时间：`2026-06-13`

本文件只保留当前 Windows Core 版本之后的高层变更记录。迁移前的旧项目名、Docker 部署、独立 Team Console dev server、旧端口和容器路径相关流水已从本文移除；需要考古时使用 Git 历史：

```powershell
git log -- docs/change-log.md
git show <commit>:docs/change-log.md
```

## 记录规则

- 只记录影响外部行为、运行方式、接口、文档结构或协作约定的变更。
- 单条记录写清日期、主题、影响范围、对应入口和关键验证。
- 不记录长命令输出、临时排障过程、一次性 UI 微调直播和旧环境运行笔记。
- 当前运行事实以 `README.md`、`.env.native.example`、`docs/native-windows-core.md` 和真实代码为准。

## 2026-06-13 - Windows Core 配置化收口

- **主题**: 清理旧版部署口径，Windows 本机部署默认单端口 `8888`，Team Console / Canvas 通过主服务 `/playground/team` 同源提供。
- **影响范围**: README、native runtime 配置、doctor/supervisor、artifact 交付、Browser 默认实例、`.pi/skills` 中会影响 agent 行为的本地地址说明。
- **配置入口**: `.env.native.example`、`UGK_DATA_DIR`、`UGK_LOG_DIR`、`UGK_TOOLS_DIR`、`PUBLIC_BASE_URL`、`HOST`、`PORT`。
- **验证建议**: `npm run native:doctor`、`npm run native:start`、打开 `http://127.0.0.1:8888/playground/team`。
