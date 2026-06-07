# HaloForge 插件开发指南

这是 HaloForge 插件的标准开发规范，覆盖插件形态、Rust 后端契约、React 面板契约、Host SDK 使用、本地测试、发布流程，以及官方插件必须遵守的 UX 规则。

在线文档入口使用 `https://docs.haloforge.dev/plugins`。

## 设计目标

HaloForge 插件应该像 HaloForge 的一部分，而不是嵌进来的独立网页。插件可以在主应用之外开发，但必须使用公开 SDK、宿主主题 token、宿主控件、局部 CSS 和明确权限。

插件开发者应把宿主当作黑盒：

- 不要读取 `window.__HF_HOST` 或其他私有全局对象。
- SDK 已提供 helper 时，不要直接调用私有 Tauri 命令。
- 不要手写 `plugin_invoke` wire command；使用 `invokePlugin()` 或 `invokeOtherPlugin()`。
- 不要假设企业版服务一定存在。只要功能能在社区版通过本地或自定义服务工作，就必须提供自定义端点路径。

## 能力级别

| Level | 使用场景 | 典型注册方式 |
| --- | --- | --- |
| 0 | 侧边栏顶级模块 | `defineModulePlugin()` 或 `definePlugin({ panel })` |
| 1 | 现有模块里的功能页 | `definePlugin({ panel })` 加 level 1 manifest 配置 |
| 2 | UI slot 注入 | `definePlugin({ slots })` |
| 3 | Assistant 注册 | `defineAssistantPlugin()` |
| 4 | 后台服务或 workflow 后端 | Rust 命令和 manifest level 4 配置 |

优先选择能满足产品面的最小级别。Image Studio 这类完整工作区应该用 Level 0；工具栏按钮应该用 Level 2。

## 推荐目录结构

官方 UI 插件建议从 `templates/level0-rust-react` 开始。

```text
my-plugin/
  manifest.json
  backend/
    Cargo.toml
    src/lib.rs
  app/
    package.json
    src/index.tsx
    src/Panel.tsx
    src/styles.css
  assets/
  dist/
```

这样可以把原生代码、前端代码、资源和发布产物分开，packager 可以构建两端并输出签名 `.hfpkg`。

## Manifest 契约

每个插件根目录都需要 `manifest.json`。

```json
{
  "id": "dev.example.my-plugin",
  "name": "My Plugin",
  "version": "0.1.0",
  "description": "Short user-facing summary.",
  "author": "Example",
  "compatibility": {
    "min_app_version": "0.8.0",
    "min_host_api_version": "0.2.15"
  },
  "capability_levels": [0],
  "host_capabilities": ["navigation", "file_intents", "theme_read"],
  "integration": {
    "level0": {
      "module_id": "my-plugin",
      "module_label": "My Plugin",
      "module_icon": "Sparkles",
      "sidebar_position": "main",
      "sidebar_order": 120,
      "panel_entry": "app/dist/index.js"
    }
  },
  "window": {
    "default_open_mode": "reuse_or_new",
    "reuse_key": "resource",
    "allow_multiple": true,
    "document_handlers": [
      {
        "id": "markdown",
        "label": "Markdown",
        "extensions": [".md", ".markdown"],
        "mime_types": ["text/markdown"],
        "route": "/document",
        "resource_param": "path"
      }
    ]
  },
  "entry": {
    "native": {
      "macos_arm64": "backend/target/release/libmy_plugin.dylib",
      "macos_x64": "backend/target/release/libmy_plugin.dylib",
      "windows_x64": "backend/target/release/my_plugin.dll",
      "linux_x64": "backend/target/release/libmy_plugin.so"
    },
    "frontend": "app/dist/index.js",
    "frontend_styles": "app/dist/styles.css"
  },
  "permissions": [
    { "type": "ipc_register" },
    { "type": "host_theme_read" }
  ],
  "commands": [
    { "id": "ping", "description": "Return plugin health information." }
  ]
}
```

规则：

- `id` 发布后必须保持稳定，不要改名。
- `version` 使用 semver，官方插件初版从 `0.1.0` 开始。
- `host_capabilities` 必须匹配前端实际使用的 SDK helper。
- `permissions` 必须保持最小权限。
- `entry.frontend` 和 `integration.*.panel_entry` 应指向构建后的 bundle。
- `commands` 里的原生命令 ID 要和 Rust 后端注册的名字一致，不能包含 SDK 自动添加的前缀。

### 窗口策略

插件如果希望自己的路由或资源进入 HaloForge 多窗口分发，可以在 manifest 里声明 `window` 配置。

- `default_open_mode`：`smart`、`current`、`new_window`、`reuse_existing` 或 `reuse_or_new`。
- `reuse_key`：`plugin`、`route`、`resource` 或 `none`。
- `allow_multiple`：是否允许同一插件同时存在多个窗口。
- `document_handlers`：把扩展名或 MIME 类型映射到插件 route 的文件/资源 handler。

真正的窗口创建、聚焦、session restore 和安全检查仍由宿主执行。插件只声明意图，HaloForge 决定最终落到哪个窗口。

`document_handlers` 是当前支持的插件侧「打开方式」能力。宿主菜单动作仍然可以按来源选择更严格的目标窗口：例如 File > Open Markdown 是当前窗口导航动作，而操作系统文件激活和 deep link 可以使用插件的多窗口策略。

应用菜单栏归宿主管理。当前 Host API 不暴露任意插件菜单注入；如果插件需要提供 File/Edit/View 菜单项，应先新增文档化的 manifest/SDK contribution，而不是依赖私有菜单实现。

## Rust 后端

插件需要以下能力时应使用 Rust 后端：

- 原生文件系统访问
- 绕开浏览器 CORS 的外部 HTTP
- 密钥处理
- 本地进程集成
- 长任务或宿主管理的任务
- 需要 manifest 权限的高权限操作

纯前端插件适合简单 UI、slot 渲染，或只消费公开 host SDK hook 的面板。官方插件如果要直接调用外部 API，通常应该通过 Rust 命令封装。

最小后端示例：

```rust
use haloforge_plugin_api::*;

pub struct MyPlugin;

impl MyPlugin {
    pub fn new() -> Self { Self }
}

impl HaloForgePlugin for MyPlugin {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            id: "dev.example.my-plugin".into(),
            name: "My Plugin".into(),
            version: "0.1.0".into(),
            description: "A sample HaloForge plugin".into(),
            author: "Example".into(),
            abi_version: PLUGIN_ABI_VERSION,
        }
    }

    fn on_load(
        &mut self,
        _ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError> {
        ipc.register("ping", Box::new(|args, _ctx| {
            Ok(serde_json::json!({
                "ok": true,
                "echo": args
            }))
        }))?;
        Ok(())
    }
}

declare_plugin!(MyPlugin, MyPlugin::new);
```

## 前端契约

前端 bundle 只注册一次：

```tsx
import { definePlugin, registerPlugin } from "@haloforge/plugin-sdk";
import { MyPanel } from "./Panel";

export default registerPlugin("dev.example.my-plugin", definePlugin({
  panel: MyPanel,
}));
```

宿主集成必须使用 SDK：

- `invokePlugin()` 调用本插件 Rust 命令。
- `invokeOtherPlugin()` 调用已声明依赖的其他插件。
- `useHostTheme()` 或 `useAppTheme()` 读取主题 token。
- `usePluginSettings()` 读取宿主管理的插件设置。
- `useHostAI()` 复用 AIChat transport。
- `enterpriseGateway()` 调用宿主管理的生图网关。函数名为历史兼容命名，产品 UI 应显示为 “HaloForge Cloud gateway” 或 “managed image gateway”。
- Level 0 插件面板如果有内部页面，使用 `usePluginNavigation()`。页面级跳转调用 `pushRoute()`，筛选/模式等状态修正用 `replaceRoute()`，并从 `current` 或 `onRouteChange()` 回写本地状态，这样 HaloForge 的后退/前进才能恢复插件内部页面。
- 插件希望 HaloForge 按 manifest 的 `window` 策略把自己的 route 或 resource 打开到合适窗口时，使用 `usePluginWindows()`。
- `AppSelect` 用于 combo box 和下拉框。
- `pickHostFile()`、`pickHostDirectory()`、`saveHostFile()` 用于宿主文件选择器。

SDK 已有控件时，不要使用原生 HTML select 自己做。

`usePluginNavigation()` 和 `usePluginWindows()` 的边界不同：

```tsx
import { usePluginNavigation, usePluginWindows } from "@haloforge/plugin-sdk";

function Panel() {
  const navigation = usePluginNavigation();
  const windows = usePluginWindows();

  function openLocalDetail(id: string) {
    navigation.pushRoute(`/detail/${id}`, { params: { id } });
  }

  async function openDocument(path: string) {
    await windows.openResource(path, {
      route: "/document",
      params: { path },
      reuseKey: "resource",
      openMode: "reuse_or_new",
    });
  }
}
```

当前窗口内的历史变化用 navigation。需要把 route/resource 交给宿主多窗口分发器时用 windows。插件不要调用私有 Tauri command 自己创建窗口。

当插件页面代表某个具体文件、任务或记录时，可以更新当前原生窗口标题：

```tsx
import { usePluginWindowTitle } from "@haloforge/plugin-sdk";

usePluginWindowTitle(fileName, { subtitle: "Markdown" });
```

HaloForge 只接受当前激活插件模块或 route 所属插件发出的标题更新，后台隐藏面板不能覆盖其他插件的标题。

## UX 与样式规则

官方插件必须适配 HaloForge shell：

- CSS 作用域必须放在插件根类下，例如 `.hfmy-root`。
- 不要在插件里全局设置 `body`、`html` 或不带根作用域的元素选择器。
- 优先使用 HaloForge CSS 变量：`--color-background`、`--color-surface`、`--color-foreground`、`--color-foreground-secondary`、`--color-border`、`--color-primary`，以及 `--hf-shell-bg` 等 shell 变量。
- 必须支持 light 和 dark 主题，不要写死单一色盘。
- 下拉框使用 `AppSelect`，文件选择使用 host file picker，图标按钮使用 lucide 图标。
- 卡片圆角保持在 8px 或更小，除非宿主已有特殊规范。
- 不要把页面 section 套进多层 card。
- 不要在界面上写解释基础操作方式的说明文。
- 窄屏下标签、按钮、chip、卡片文本不能溢出。

## 多语言

插件所有用户可见文本都应提供英文和中文。

推荐模式：

- 建立 typed translation key map。
- 可用时读取 `localStorage["hf:locale"]`。
- 回退到 `navigator.language`。
- 缺失 key 回退英文。
- Provider 名称和 API 术语保持稳定，但按钮、状态、错误、空状态等都要本地化。

社区版里使用中性产品语言。例如显示 “HaloForge Cloud gateway” 或 “Managed gateway”，不要显示 “Enterprise gateway”，除非界面本身明确只属于企业版。

## 托管生图网关与社区版 fallback

生图插件应支持两条路径：

1. **托管网关**：调用 `@haloforge/plugin-sdk` 的 `enterpriseGateway()`，声明 `host_capabilities: ["enterprise_gateway"]`，并申请 `{ "type": "host_enterprise_gateway_access" }`。
2. **自定义端点**：允许社区版用户配置 OpenAI-compatible `baseUrl` 和可选 API key。涉及 CORS 或密钥处理时，HTTP 应经过 Rust 后端。

托管网关背后可能是 HaloForge Cloud，也可能是 Enterprise Server，取决于宿主登录状态。插件 UI 不应该区分二者，除非这个区别会影响用户操作。

## 本地开发流程

每次交付前使用同一套检查：

```bash
npm install
npm run typecheck
npm run build
cargo fmt --check
cargo check
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --out dist/package
```

安装到本地 HaloForge：

```bash
cd /path/to/HaloForge
npm run hf -- plugin install local /path/to/my-plugin/dist/package/dev.example.my-plugin-0.1.0.hfpkg --json
```

然后启动 HaloForge 并确认：

- 插件面板能挂载
- bundle 注册的 plugin ID 和 `manifest.json` 一致
- light/dark 主题都像宿主原生界面
- SDK 控件正常渲染
- Rust 命令返回预期数据
- 安装权限提示符合预期
- 日志没有面板注册、IPC 或权限错误

## 打包与发布

官方插件：

```bash
npx @haloforge/plugin-pack check .
npx @haloforge/plugin-pack pack . --release --out dist/package
npx @haloforge/plugin-pack metadata dist/package/dev.example.my-plugin-0.1.0.hfpkg \
  --signing-key-id haloforge-official-2026-05 \
  --signing-key-env HF_PLUGIN_SIGNING_PRIVATE_KEY \
  --pretty \
  --output dist/catalog-draft.json
```

官方仓库应通过 GitHub Actions 发布，并配置 repository secrets：

- `hf_plugin_signing_private_key`
- `hf_plugin_signing_key_id`
- 需要提交 catalog metadata 的 workflow 再配置 `HF_ADMIN_TOKEN`

如果插件依赖新的 SDK 或权限能力，应先发布 SDK 和 packager，再发布插件。

## Review Checklist

- Manifest ID、version、entry、host capability、permission、command 都和实现一致。
- 前端只注册一次，并使用 manifest 里的 plugin ID。
- 没有直接使用私有 host bridge。
- 没有手写 `plugin_invoke` wire name。
- UI 使用 host token 和 SDK 控件。
- 英文和中文覆盖全部可见文案。
- 社区版路径不依赖 Enterprise Server。
- 涉及外部 HTTP 和密钥时由 Rust 后端处理。
- `hf-pack check`、前端构建、Rust check、本地安装均通过。
