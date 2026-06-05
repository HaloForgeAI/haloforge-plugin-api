use serde::{Deserialize, Serialize};
use crate::permissions::Permission;

/// Full parsed plugin manifest (from manifest.json inside .hfpkg).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default)]
    pub long_description: Option<String>,
    pub author: String,
    #[serde(default)]
    pub author_url: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub keywords: Vec<String>,
    #[serde(default)]
    pub icon: Option<String>,

    pub compatibility: CompatibilitySpec,

    /// Which capability levels this plugin uses (e.g. [1, 4]).
    pub capability_levels: Vec<CapabilityLevel>,

    /// Per-level integration configuration.
    #[serde(default)]
    pub integration: IntegrationConfig,

    /// Declarative host window policy for plugin routes and file/resource handlers.
    #[serde(default)]
    pub window: WindowPolicyConfig,

    /// Entry points for native library and frontend bundle.
    #[serde(default)]
    pub entry: EntryConfig,

    /// Other plugin IDs this plugin depends on.
    #[serde(default)]
    pub dependencies: Vec<PluginDependency>,

    /// Declared permissions (checked at install time and enforced at runtime).
    #[serde(default)]
    pub permissions: Vec<Permission>,

    /// Declarative access to stable host-side capability groups.
    /// These should match the host hooks used from `@haloforge/plugin-sdk`.
    #[serde(default)]
    pub host_capabilities: Vec<HostCapability>,

    /// JSON Schema for plugin settings (auto-rendered in Plugin Manager).
    #[serde(default)]
    pub settings_schema: Option<serde_json::Value>,

    /// IPC commands this plugin registers (informational, for documentation).
    #[serde(default)]
    pub commands: Vec<CommandDeclaration>,

    /// SHA-256 checksum of the .hfpkg file. Required for published plugins.
    #[serde(default)]
    pub checksum: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompatibilitySpec {
    pub min_app_version: String,
    #[serde(default)]
    pub min_host_api_version: Option<String>,
    #[serde(default)]
    pub max_app_version: Option<String>,
    #[serde(default = "all_platforms")]
    pub platforms: Vec<String>,
}

fn all_platforms() -> Vec<String> {
    vec!["windows".into(), "macos".into(), "linux".into()]
}

/// Capability level integer constants (matching the design doc).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(from = "u8", into = "u8")]
pub enum CapabilityLevel {
    /// Level 0 — Top-level module (same tier as DevKit/AIChat).
    Module = 0,
    /// Level 1 — Feature inside an existing module.
    ModuleFeature = 1,
    /// Level 2 — UI slot injection / extension.
    UiExtension = 2,
    /// Level 3 — AI assistant registration.
    AiAssistant = 3,
    /// Level 4 — Headless service / backend extension.
    Service = 4,
}

/// Stable, documented host capability groups for black-box-compatible plugins.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostCapability {
    Navigation,
    AppState,
    FileIntents,
    FileDialogs,
    #[serde(rename = "aichat")]
    AiChat,
    EnterpriseGateway,
    DeepLinks,
    ThemeRead,
    EventSubscribe,
}

impl HostCapability {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Navigation => "navigation",
            Self::AppState => "app_state",
            Self::FileIntents => "file_intents",
            Self::FileDialogs => "file_dialogs",
            Self::AiChat => "aichat",
            Self::EnterpriseGateway => "enterprise_gateway",
            Self::DeepLinks => "deep_links",
            Self::ThemeRead => "theme_read",
            Self::EventSubscribe => "event_subscribe",
        }
    }
}

impl From<u8> for CapabilityLevel {
    fn from(v: u8) -> Self {
        match v {
            0 => Self::Module,
            1 => Self::ModuleFeature,
            2 => Self::UiExtension,
            3 => Self::AiAssistant,
            4 => Self::Service,
            _ => Self::Service,
        }
    }
}

impl From<CapabilityLevel> for u8 {
    fn from(l: CapabilityLevel) -> u8 {
        l as u8
    }
}

/// Integration configuration block — one sub-block per declared level.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct IntegrationConfig {
    #[serde(default)]
    pub level0: Option<Level0Config>,
    #[serde(default)]
    pub level1: Option<Level1Config>,
    #[serde(default)]
    pub level2: Option<Level2Config>,
    #[serde(default)]
    pub level3: Option<Level3Config>,
    #[serde(default)]
    pub level4: Option<Level4Config>,
}

/// Declarative window behavior requested by a plugin.
///
/// The host owns actual window creation and decides whether a request is allowed,
/// but these fields let a plugin describe how its routes and resources should be
/// opened when invoked from menus, deeplinks, file associations, or other plugins.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WindowPolicyConfig {
    /// Default open behavior for plugin routes: "smart", "current", "new_window",
    /// "reuse_existing", or "reuse_or_new".
    #[serde(default)]
    pub default_open_mode: Option<String>,
    /// Default reuse key: "plugin", "route", "resource", or "none".
    #[serde(default)]
    pub reuse_key: Option<String>,
    /// Whether this plugin may have more than one window at the same time.
    /// Omitted means the host default is used.
    #[serde(default)]
    pub allow_multiple: Option<bool>,
    /// File/resource handlers declared by this plugin.
    #[serde(default)]
    pub document_handlers: Vec<DocumentHandlerConfig>,
}

/// File or resource entry point that can be routed into a plugin panel.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DocumentHandlerConfig {
    /// Stable handler id, unique within the plugin. Defaults to the route when omitted.
    #[serde(default)]
    pub id: Option<String>,
    /// User-facing handler label, used in menus and open-with UI.
    #[serde(default)]
    pub label: Option<String>,
    /// Lowercase extensions including the leading dot, for example [".md"].
    #[serde(default)]
    pub extensions: Vec<String>,
    /// MIME types handled by this plugin.
    #[serde(default)]
    pub mime_types: Vec<String>,
    /// Plugin route opened for this resource.
    pub route: String,
    /// Query parameter that receives the resource path/URI. Defaults to "path".
    #[serde(default)]
    pub resource_param: Option<String>,
    /// Handler-specific open behavior; falls back to the plugin window policy.
    #[serde(default)]
    pub open_mode: Option<String>,
    /// Handler-specific reuse key; falls back to the plugin window policy.
    #[serde(default)]
    pub reuse_key: Option<String>,
    /// Handler-specific multiple-window allowance; falls back to the plugin policy.
    #[serde(default)]
    pub allow_multiple: Option<bool>,
}

/// Level 0 — The plugin adds a new top-level module to the sidebar.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level0Config {
    /// Unique module ID (must not collide with "devkit", "aichat", "settings").
    pub module_id: String,
    pub module_label: String,
    /// Lucide icon name.
    pub module_icon: String,
    /// "main" = above the settings divider; "bottom" = below it.
    #[serde(default = "default_sidebar_position")]
    pub sidebar_position: String,
    /// Lower = higher up. Defaults to 100.
    #[serde(default = "default_sidebar_order")]
    pub sidebar_order: u32,
    /// Path inside the package to the JS bundle for this module's panel.
    pub panel_entry: String,
}

fn default_sidebar_position() -> String { "main".into() }
fn default_sidebar_order() -> u32 { 100 }

/// Level 1 — The plugin adds a feature tab to an existing module.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level1Config {
    /// Target module: "devkit", "aichat", or a plugin module_id.
    pub parent_module: String,
    /// Unique tab ID within the parent module.
    pub tab_id: String,
    pub tab_label: String,
    /// Lucide icon name.
    pub tab_icon: String,
    /// "after:snippet" | "before:summary" | "index:5"
    #[serde(default)]
    pub tab_position: Option<String>,
    /// Path inside the package to the JS bundle for this tab's panel.
    pub panel_entry: String,
}

/// Level 2 — The plugin injects into UI slots.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level2Config {
    /// Which slots the plugin injects into (see UI Slot Reference in the design doc).
    pub slots: Vec<String>,
}

/// Level 3 — The plugin registers an AI assistant.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Level3Config {
    pub assistant_id: String,
    pub assistant_name: String,
    #[serde(default)]
    pub assistant_icon: Option<String>,
    #[serde(default)]
    pub assistant_description: Option<String>,
    /// Path inside the package to the system prompt markdown file.
    pub system_prompt_file: String,
    /// Optional: auto-select a specific model_config_id for this assistant.
    #[serde(default)]
    pub preferred_model: Option<String>,
}

/// Level 4 — The plugin registers backend services / workflow step types.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Level4Config {
    /// Step type IDs this plugin registers (e.g. ["p4_sync", "p4_submit"]).
    #[serde(default)]
    pub workflow_step_types: Vec<String>,
}

/// Native library paths per platform.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EntryConfig {
    #[serde(default)]
    pub native: Option<NativeEntry>,
    #[serde(default)]
    pub frontend: Option<String>,
    #[serde(default)]
    pub frontend_styles: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NativeEntry {
    #[serde(default)]
    pub macos_arm64: Option<String>,
    #[serde(default)]
    pub macos_x64: Option<String>,
    #[serde(default)]
    pub windows_x64: Option<String>,
    #[serde(default)]
    pub windows_arm64: Option<String>,
    #[serde(default)]
    pub linux_x64: Option<String>,
    #[serde(default)]
    pub linux_arm64: Option<String>,
}

impl NativeEntry {
    /// Return the library path for the current platform/arch, if present.
    pub fn for_current_platform(&self) -> Option<&str> {
        #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
        return self.macos_arm64.as_deref();

        #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
        return self.macos_x64.as_deref();

        #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
        return self.windows_x64.as_deref();

        #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
        return self.windows_arm64.as_deref();

        #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
        return self.linux_x64.as_deref();

        #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
        return self.linux_arm64.as_deref();

        #[allow(unreachable_code)]
        None
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginDependency {
    pub id: String,
    /// SemVer requirement string, e.g. ">=1.0.0".
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandDeclaration {
    pub id: String,
    #[serde(default)]
    pub description: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::{HostCapability, PluginManifest};

    #[test]
    fn manifest_supports_public_host_api_fields() {
        let manifest: PluginManifest = serde_json::from_value(serde_json::json!({
            "id": "dev.haloforge.example",
            "name": "Example",
            "version": "0.1.0",
            "description": "Example plugin",
            "author": "HaloForge Team",
            "compatibility": {
                "min_app_version": "0.1.0",
                "min_host_api_version": "0.1.0",
                "platforms": ["windows"]
            },
            "capability_levels": [2],
            "host_capabilities": ["navigation", "aichat"],
            "integration": {
                "level2": { "slots": ["devkit.toolbar"] }
            }
        }))
        .expect("manifest should deserialize");

        assert_eq!(
            manifest.compatibility.min_host_api_version.as_deref(),
            Some("0.1.0")
        );
        assert_eq!(
            manifest.host_capabilities,
            vec![HostCapability::Navigation, HostCapability::AiChat]
        );
    }

    #[test]
    fn manifest_supports_window_policy_document_handlers() {
        let manifest: PluginManifest = serde_json::from_value(serde_json::json!({
            "id": "dev.haloforge.markdown",
            "name": "Markdown",
            "version": "0.2.13",
            "description": "Markdown plugin",
            "author": "HaloForge Team",
            "compatibility": {
                "min_app_version": "0.8.0",
                "min_host_api_version": "0.2.13",
                "platforms": ["windows", "macos", "linux"]
            },
            "capability_levels": [0],
            "host_capabilities": ["navigation", "file_intents"],
            "integration": {
                "level0": {
                    "module_id": "markdown",
                    "module_label": "Markdown",
                    "module_icon": "FileText",
                    "panel_entry": "app/dist/index.js"
                }
            },
            "window": {
                "default_open_mode": "reuse_or_new",
                "reuse_key": "resource",
                "allow_multiple": true,
                "document_handlers": [{
                    "id": "markdown",
                    "label": "Markdown",
                    "extensions": [".md", ".markdown"],
                    "mime_types": ["text/markdown"],
                    "route": "/document",
                    "resource_param": "path"
                }]
            }
        }))
        .expect("manifest should deserialize");

        assert_eq!(manifest.window.default_open_mode.as_deref(), Some("reuse_or_new"));
        assert_eq!(manifest.window.reuse_key.as_deref(), Some("resource"));
        assert_eq!(manifest.window.allow_multiple, Some(true));
        let handler = manifest
            .window
            .document_handlers
            .first()
            .expect("document handler should deserialize");
        assert_eq!(handler.extensions, vec![".md", ".markdown"]);
        assert_eq!(handler.mime_types, vec!["text/markdown"]);
        assert_eq!(handler.route, "/document");
        assert_eq!(handler.resource_param.as_deref(), Some("path"));
    }

    #[test]
    fn host_capability_names_are_stable() {
        assert_eq!(HostCapability::FileIntents.as_str(), "file_intents");
        assert_eq!(HostCapability::FileDialogs.as_str(), "file_dialogs");
        assert_eq!(HostCapability::DeepLinks.as_str(), "deep_links");
        assert_eq!(HostCapability::ThemeRead.as_str(), "theme_read");
    }
}
