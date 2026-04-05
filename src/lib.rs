pub mod error;
pub mod manifest;
pub mod permissions;
pub mod types;

pub use error::PluginError;
pub use manifest::{PluginManifest, CapabilityLevel, IntegrationConfig};
pub use permissions::Permission;
pub use types::*;

/// The stable ABI version of this plugin API.
/// Increment MAJOR on any breaking change to the HaloForgePlugin trait or context traits.
pub const PLUGIN_ABI_VERSION: u32 = 1;

// ─── The core plugin trait ────────────────────────────────────────────────────

/// Every native plugin must implement this trait.
///
/// The host loads the dynamic library, calls `_haloforge_plugin_create()` (declared via
/// the `declare_plugin!` macro) to obtain a `Box<dyn HaloForgePlugin>`, then calls
/// `on_load()`. On disable/shutdown, `on_unload()` is called.
pub trait HaloForgePlugin: Send + Sync {
    /// Return plugin metadata. Called before `on_load`.
    fn metadata(&self) -> PluginMetadata;

    /// Called after the plugin is loaded and context is ready.
    /// Register IPC commands, workflow step types, subscribe to events, create DB tables here.
    fn on_load(
        &mut self,
        ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError>;

    /// Called when the plugin is being unloaded (disabled or app shutdown).
    /// Stop background tasks, release file handles, unsubscribe events.
    fn on_unload(&mut self) -> Result<(), PluginError>;

    /// Called when the user saves new settings for this plugin in Plugin Manager.
    fn on_settings_changed(&mut self, _settings: serde_json::Value) -> Result<(), PluginError> {
        Ok(())
    }

    /// Called to execute a workflow step of a type registered by this plugin (Level 4).
    /// Return a JSON result value on success, or PluginError on failure.
    fn execute_workflow_step(
        &mut self,
        _step_type: &str,
        _config: serde_json::Value,
        _ctx: &dyn PluginContext,
    ) -> Result<serde_json::Value, PluginError> {
        Err(PluginError::Unsupported("execute_workflow_step".into()))
    }
}

// ─── Plugin context (passed to the plugin at on_load) ────────────────────────

/// The host-provided context injected into the plugin at load time.
/// This is the plugin's *only* gateway to host services.
pub trait PluginContext: Send + Sync {
    /// Sandboxed database access (own tables + approved host tables).
    fn db(&self) -> &dyn DatabaseAccess;

    /// App event bus.
    fn events(&self) -> &dyn EventBus;

    /// HTTP client — `None` if `network:http*` not granted.
    fn http(&self) -> Option<&dyn HttpClient>;

    /// Filesystem access — `None` if `filesystem:*` not granted.
    fn fs(&self) -> Option<&dyn PluginFs>;

    /// Process runner — `None` if `process:spawn*` not granted.
    fn process(&self) -> Option<&dyn ProcessRunner>;

    /// Read the plugin's current settings (values from `settings_schema`).
    fn settings(&self) -> serde_json::Value;

    /// Persist updated plugin settings.
    fn save_settings(&self, settings: serde_json::Value) -> Result<(), PluginError>;

    /// Absolute path to the plugin's private data directory.
    /// e.g. `~/.haloforge/plugins/{plugin-id}/data/`
    fn data_dir(&self) -> std::path::PathBuf;

    /// Emit a structured log line tagged with the plugin id.
    fn log(&self, level: LogLevel, msg: &str);

    /// Show a toast notification in the HaloForge UI.
    fn notify(&self, notification: Notification);
}

// ─── Database access ──────────────────────────────────────────────────────────

pub trait DatabaseAccess: Send + Sync {
    /// Execute a SELECT against plugin-owned tables.
    /// Table names must start with `plugin_{plugin_id}_`.
    fn query(
        &self,
        sql: &str,
        params: &[serde_json::Value],
    ) -> Result<Vec<std::collections::HashMap<String, serde_json::Value>>, PluginError>;

    /// Execute INSERT / UPDATE / DELETE against plugin-owned tables.
    fn execute(
        &self,
        sql: &str,
        params: &[serde_json::Value],
    ) -> Result<usize, PluginError>;

    /// Create a table in the plugin's namespace.
    /// The actual table name will be `plugin_{plugin_id}_{table_name}`.
    fn create_table(&self, table_name: &str, schema_sql: &str) -> Result<(), PluginError>;

    /// Read rows from an approved host table.
    /// Requires `database:read:<table>` permission.
    fn read_host_table(
        &self,
        table: HostTable,
        limit: Option<u32>,
    ) -> Result<Vec<serde_json::Value>, PluginError>;
}

/// Host tables that can be granted read access.
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum HostTable {
    LaunchProfiles,
    Workflows,
    CodeSnippets,
    Skills,
    McpServers,
    ChatSessions,
    ModelConfigs,
}

impl HostTable {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::LaunchProfiles => "launch_profiles",
            Self::Workflows      => "workflows",
            Self::CodeSnippets   => "code_snippets",
            Self::Skills         => "skills",
            Self::McpServers     => "mcp_servers",
            Self::ChatSessions   => "chat_sessions",
            Self::ModelConfigs   => "model_configs",
        }
    }

    pub fn required_permission(&self) -> Permission {
        Permission::DatabaseRead(self.as_str().to_string())
    }
}

// ─── Event bus ────────────────────────────────────────────────────────────────

pub trait EventBus: Send + Sync {
    /// Emit a plugin-scoped event.
    /// Full event name on the wire: `plugin:{plugin_id}:{event}`
    fn emit(&self, event: &str, payload: serde_json::Value) -> Result<(), PluginError>;

    /// Subscribe to a well-known app event.
    /// Returns a token for unsubscribing.
    fn subscribe(
        &self,
        event: AppEvent,
        handler: Box<dyn Fn(serde_json::Value) + Send + Sync>,
    ) -> SubscriptionToken;

    fn unsubscribe(&self, token: SubscriptionToken);
}

/// Well-known app events plugins can subscribe to.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AppEvent {
    AppStarted,
    AppShuttingDown,
    ThemeChanged,
    WorkflowStarted    { workflow_id: String },
    WorkflowCompleted  { workflow_id: String, success: bool },
    WorkflowStepCompleted { workflow_id: String, step_index: usize },
    ProfileLaunched    { profile_id: String },
    ProfileStopped     { profile_id: String },
    ChatMessageSent    { session_id: String },
    ChatStreamCompleted{ session_id: String },
    SettingsChanged,
    Custom             { name: String },
}

// ─── HTTP client ──────────────────────────────────────────────────────────────

pub trait HttpClient: Send + Sync {
    fn get(
        &self,
        url: &str,
        headers: Option<std::collections::HashMap<String, String>>,
    ) -> Result<HttpResponse, PluginError>;

    fn post(
        &self,
        url: &str,
        body: serde_json::Value,
        headers: Option<std::collections::HashMap<String, String>>,
    ) -> Result<HttpResponse, PluginError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: serde_json::Value,
}

// ─── Filesystem ───────────────────────────────────────────────────────────────

pub trait PluginFs: Send + Sync {
    fn read_file(&self, path: &std::path::Path) -> Result<Vec<u8>, PluginError>;
    fn write_file(&self, path: &std::path::Path, content: &[u8]) -> Result<(), PluginError>;
    fn read_dir(&self, path: &std::path::Path) -> Result<Vec<FsEntry>, PluginError>;
    fn exists(&self, path: &std::path::Path) -> bool;
    fn create_dir_all(&self, path: &std::path::Path) -> Result<(), PluginError>;
    fn remove_file(&self, path: &std::path::Path) -> Result<(), PluginError>;
    fn remove_dir_all(&self, path: &std::path::Path) -> Result<(), PluginError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct FsEntry {
    pub path: std::path::PathBuf,
    pub is_dir: bool,
    pub size: Option<u64>,
}

// ─── Process runner ───────────────────────────────────────────────────────────

pub trait ProcessRunner: Send + Sync {
    /// Run a whitelisted executable and wait for it to finish.
    fn run(
        &self,
        executable: &str,
        args: &[&str],
        cwd: Option<&std::path::Path>,
    ) -> Result<ProcessOutput, PluginError>;
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ProcessOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

// ─── IPC registrar ────────────────────────────────────────────────────────────

/// Handler type for plugin IPC commands.
/// Takes (args JSON, plugin context), returns result JSON.
pub type IpcHandler = Box<
    dyn Fn(serde_json::Value, &dyn PluginContext) -> Result<serde_json::Value, PluginError>
        + Send
        + Sync,
>;

pub trait IpcRegistrar: Send + Sync {
    /// Register a command callable from the frontend.
    /// On the wire the command name is prefixed: `plugin_{plugin_id}_{name}`
    fn register(&mut self, name: &str, handler: IpcHandler) -> Result<(), PluginError>;

    /// Register a workflow step type (Level 4).
    fn register_workflow_step_type(
        &mut self,
        definition: WorkflowStepTypeDefinition,
    ) -> Result<(), PluginError>;
}

// ─── Entry-point macro ───────────────────────────────────────────────────────

/// Every native plugin crate must call this macro exactly once.
///
/// # Example
/// ```rust
/// declare_plugin!(MyPlugin, MyPlugin::new);
/// ```
#[macro_export]
macro_rules! declare_plugin {
    ($plugin_type:ty, $constructor:path) => {
        #[no_mangle]
        pub extern "C" fn _haloforge_plugin_create() -> *mut dyn $crate::HaloForgePlugin {
            let plugin: $plugin_type = $constructor();
            Box::into_raw(Box::new(plugin))
        }

        #[no_mangle]
        pub extern "C" fn _haloforge_plugin_destroy(ptr: *mut dyn $crate::HaloForgePlugin) {
            if !ptr.is_null() {
                unsafe { drop(Box::from_raw(ptr)); }
            }
        }

        #[no_mangle]
        pub extern "C" fn _haloforge_abi_version() -> u32 {
            $crate::PLUGIN_ABI_VERSION
        }
    };
}
