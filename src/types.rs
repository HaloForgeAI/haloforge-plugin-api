use serde::{Deserialize, Serialize};

// ─── Plugin Metadata ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginMetadata {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub abi_version: u32,
}

// ─── Workflow step type registration ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowStepTypeDefinition {
    /// Unique ID for this step type, e.g. "p4_sync".
    /// On the wire it is namespaced as `{plugin_id}:{type_id}`.
    pub type_id: String,
    pub display_name: String,
    pub description: String,
    /// Lucide icon name (resolved by the host at runtime).
    pub icon: String,
    /// Category shown in the workflow step picker (e.g. "Source Control").
    pub category: String,
    /// JSON Schema describing the step's config fields.
    /// Rendered automatically in the Workflow Editor.
    pub config_schema: serde_json::Value,
}

// ─── Subscription / watch tokens ─────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct SubscriptionToken(pub u64);

// ─── Logging ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Trace,
    Debug,
    Info,
    Warn,
    Error,
}

// ─── Notifications ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub title: String,
    pub message: String,
    pub kind: NotificationKind,
    #[serde(default)]
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationKind {
    Info,
    Success,
    Warning,
    Error,
}

// ─── Plugin state (reported back to the frontend) ────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginState {
    Inactive,
    Loading,
    Active,
    Error,
    Unloading,
}

// ─── Plugin registry record (what the DB + frontend use) ─────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginRecord {
    pub id: String,
    pub name: String,
    pub version: String,
    pub capability_levels: Vec<u8>,
    pub manifest: serde_json::Value,
    pub enabled: bool,
    pub state: PluginState,
    pub error_message: Option<String>,
    pub install_date: String,
    pub update_date: Option<String>,
    pub install_source: String,
    pub permissions_granted: Vec<String>,
    pub plugin_dir: String,
}
