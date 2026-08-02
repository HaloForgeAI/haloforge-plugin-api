use serde_json::Value;

/// Fine-grained permissions a plugin must declare in its manifest.
/// The host checks these at install time (user approval) and at runtime (sandbox enforcement).
#[derive(Debug, Clone, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", content = "value", rename_all = "snake_case")]
pub enum Permission {
    /// Read any host table.
    DatabaseReadAll,
    /// Read a specific host table (e.g. "launch_profiles").
    DatabaseRead(String),
    /// Write to a specific host table. Restricted tier.
    DatabaseWrite(String),
    /// Create tables in the plugin's own namespace.
    DatabaseCreateTables,

    /// Read any filesystem path (prompts user on first use).
    FilesystemRead,
    /// Read within the HaloForge app-data directory only.
    FilesystemReadAppData,
    /// Write any filesystem path (prompts user on first use).
    FilesystemWrite,
    /// Write within the HaloForge app-data directory only.
    FilesystemWriteAppData,

    /// Make outbound HTTP requests to any URL.
    NetworkHttp,
    /// Make outbound HTTP requests to a specific domain only.
    NetworkHttpDomain(String),

    /// Register new Tauri IPC commands.
    IpcRegister,

    /// Emit events on the app event bus.
    EventsEmit,
    /// Listen to app lifecycle events.
    EventsListen,

    /// Inject into UI slots (implied by capability_levels 1/2).
    UiInject,

    /// Spawn any child process (high risk — Restricted tier).
    ProcessSpawn,
    /// Spawn only executables from a declared whitelist.
    ProcessSpawnWhitelist(Vec<String>),

    /// Show desktop toast notifications.
    Notifications,

    /// Read the clipboard.
    ClipboardRead,
    /// Write to the clipboard.
    ClipboardWrite,

    /// Navigate within the host UI (module switches, opening settings tabs).
    HostNavigation,
    /// Read stable host UI state such as the active module or settings tab.
    HostAppStateRead,
    /// Consume file-open intents routed by the host shell.
    HostFileIntents,
    /// Open stable host file and directory picker dialogs.
    HostFileDialogs,
    /// Subscribe to host-managed file change notifications.
    HostFileWatch,
    /// Reuse the host AIChat transport and model selection.
    #[serde(rename = "host_aichat_access")]
    HostAIChatAccess,
    /// Call managed image gateway endpoints through the host session.
    #[serde(rename = "host_enterprise_gateway_access")]
    HostEnterpriseGatewayAccess,
    /// Receive plugin-scoped haloforge:// deep links routed by the host.
    HostDeepLinks,
    /// Read the active host theme and design tokens.
    HostThemeRead,
    /// Subscribe to stable host events exposed to plugins.
    HostEventSubscribe,

    /// Read app config (theme, language).
    AppConfigRead,
}

pub const HOST_AICHAT_ACCESS_PERMISSION: &str = "host_aichat_access";
pub const HOST_ENTERPRISE_GATEWAY_ACCESS_PERMISSION: &str = "host_enterprise_gateway_access";
pub const INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION: &str = "host_a_i_chat_access";

#[derive(Clone, Copy)]
enum PermissionValueShape {
    None,
    String,
    StringArray,
}

#[derive(Clone, Copy)]
struct PermissionSchema {
    type_name: &'static str,
    value_shape: PermissionValueShape,
}

const PERMISSION_SCHEMAS: &[PermissionSchema] = &[
    PermissionSchema { type_name: "database_read_all", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "database_read", value_shape: PermissionValueShape::String },
    PermissionSchema { type_name: "database_write", value_shape: PermissionValueShape::String },
    PermissionSchema { type_name: "database_create_tables", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "filesystem_read", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "filesystem_read_app_data", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "filesystem_write", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "filesystem_write_app_data", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "network_http", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "network_http_domain", value_shape: PermissionValueShape::String },
    PermissionSchema { type_name: "ipc_register", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "events_emit", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "events_listen", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "ui_inject", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "process_spawn", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "process_spawn_whitelist", value_shape: PermissionValueShape::StringArray },
    PermissionSchema { type_name: "notifications", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "clipboard_read", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "clipboard_write", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_navigation", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_app_state_read", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_file_intents", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_file_dialogs", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_file_watch", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: HOST_AICHAT_ACCESS_PERMISSION, value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: HOST_ENTERPRISE_GATEWAY_ACCESS_PERMISSION, value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_deep_links", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_theme_read", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "host_event_subscribe", value_shape: PermissionValueShape::None },
    PermissionSchema { type_name: "app_config_read", value_shape: PermissionValueShape::None },
];

impl Permission {
    /// Approval tier for this permission.
    pub fn tier(&self) -> PermissionTier {
        match self {
            Self::UiInject
            | Self::EventsListen
            | Self::DatabaseCreateTables
            | Self::AppConfigRead
            | Self::Notifications
            | Self::HostAppStateRead
            | Self::HostThemeRead => PermissionTier::Transparent,

            Self::DatabaseReadAll
            | Self::DatabaseRead(_)
            | Self::IpcRegister
            | Self::EventsEmit
            | Self::NetworkHttpDomain(_)
            | Self::HostNavigation
            | Self::HostFileIntents
            | Self::HostFileDialogs
            | Self::HostFileWatch
            | Self::HostAIChatAccess
            | Self::HostEnterpriseGatewayAccess
            | Self::HostDeepLinks
            | Self::HostEventSubscribe => PermissionTier::Standard,

            Self::FilesystemRead
            | Self::FilesystemWrite
            | Self::FilesystemReadAppData
            | Self::FilesystemWriteAppData
            | Self::NetworkHttp
            | Self::ProcessSpawnWhitelist(_)
            | Self::ClipboardRead
            | Self::ClipboardWrite => PermissionTier::Sensitive,

            Self::DatabaseWrite(_)
            | Self::ProcessSpawn => PermissionTier::Restricted,
        }
    }

    /// Human-readable description shown in the permission prompt.
    pub fn description(&self) -> String {
        match self {
            Self::DatabaseReadAll           => "Read all app data".into(),
            Self::DatabaseRead(t)           => format!("Read table: {t}"),
            Self::DatabaseWrite(t)          => format!("Write to table: {t}"),
            Self::DatabaseCreateTables      => "Create plugin-owned database tables".into(),
            Self::FilesystemRead            => "Read files from your filesystem".into(),
            Self::FilesystemReadAppData     => "Read files in the app data directory".into(),
            Self::FilesystemWrite           => "Write files to your filesystem".into(),
            Self::FilesystemWriteAppData    => "Write files in the app data directory".into(),
            Self::NetworkHttp               => "Make outbound HTTP requests".into(),
            Self::NetworkHttpDomain(d)      => format!("Make HTTP requests to: {d}"),
            Self::IpcRegister               => "Register new app commands".into(),
            Self::EventsEmit                => "Emit app events".into(),
            Self::EventsListen              => "Listen to app lifecycle events".into(),
            Self::UiInject                  => "Inject UI components".into(),
            Self::ProcessSpawn              => "Spawn arbitrary child processes".into(),
            Self::ProcessSpawnWhitelist(v)  => format!("Spawn processes: {}", v.join(", ")),
            Self::Notifications             => "Show desktop notifications".into(),
            Self::ClipboardRead             => "Read the clipboard".into(),
            Self::ClipboardWrite            => "Write to the clipboard".into(),
            Self::HostNavigation            => "Navigate within HaloForge".into(),
            Self::HostAppStateRead          => "Read HaloForge UI state".into(),
            Self::HostFileIntents           => "Receive file-open intents from HaloForge".into(),
            Self::HostFileDialogs           => "Open HaloForge file and directory dialogs".into(),
            Self::HostFileWatch             => "Watch files for changes through HaloForge".into(),
            Self::HostAIChatAccess          => "Use HaloForge AI models and chat transport".into(),
            Self::HostEnterpriseGatewayAccess => "Use HaloForge managed image gateway through the host session".into(),
            Self::HostDeepLinks             => "Receive HaloForge deep links routed to this plugin".into(),
            Self::HostThemeRead             => "Read HaloForge theme tokens".into(),
            Self::HostEventSubscribe        => "Subscribe to HaloForge host events".into(),
            Self::AppConfigRead             => "Read app configuration".into(),
        }
    }
}

pub fn validate_manifest_permissions_json(value: &Value) -> Result<(), String> {
    let permissions = value
        .as_array()
        .ok_or_else(|| "Plugin manifest permissions must be an array.".to_string())?;

    for (index, permission) in permissions.iter().enumerate() {
        validate_manifest_permission_json(permission)
            .map_err(|error| format!("manifest.permissions[{index}]: {error}"))?;
    }

    Ok(())
}

pub fn validate_manifest_permission_json(value: &Value) -> Result<(), String> {
    let permission = value
        .as_object()
        .ok_or_else(|| "Plugin permission entries must be JSON objects.".to_string())?;
    let type_name = permission
        .get("type")
        .and_then(Value::as_str)
        .ok_or_else(|| "Plugin permission 'type' must be a string.".to_string())?;

    if type_name == INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION {
        return Err(format!(
            "Invalid plugin permission '{INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION}'. Use '{HOST_AICHAT_ACCESS_PERMISSION}'."
        ));
    }

    let schema = PERMISSION_SCHEMAS
        .iter()
        .find(|schema| schema.type_name == type_name)
        .ok_or_else(|| format!("Unknown plugin permission '{type_name}'."))?;

    match schema.value_shape {
        PermissionValueShape::None => Ok(()),
        PermissionValueShape::String => {
            if permission.get("value").and_then(Value::as_str).is_some() {
                Ok(())
            } else {
                Err(format!("Plugin permission '{type_name}' requires a string 'value'."))
            }
        }
        PermissionValueShape::StringArray => {
            let Some(values) = permission.get("value").and_then(Value::as_array) else {
                return Err(format!("Plugin permission '{type_name}' requires an array 'value'."));
            };
            if values.iter().all(|value| value.as_str().is_some()) {
                Ok(())
            } else {
                Err(format!(
                    "Plugin permission '{type_name}' requires every 'value' item to be a string."
                ))
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub enum PermissionTier {
    /// Auto-granted at install time with no user prompt.
    Transparent = 0,
    /// Shown once at install time; user approves/denies.
    Standard = 1,
    /// Shown at install + confirmation on first actual use.
    Sensitive = 2,
    /// Disabled by default; user must manually enable in Plugin Manager.
    Restricted = 3,
}

#[cfg(test)]
mod tests {
    use super::{
        validate_manifest_permission_json, validate_manifest_permissions_json, Permission,
        PermissionTier, HOST_AICHAT_ACCESS_PERMISSION, HOST_ENTERPRISE_GATEWAY_ACCESS_PERMISSION,
        INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION,
    };
    use serde_json::json;

    #[test]
    fn host_permissions_have_expected_tiers() {
        assert_eq!(Permission::HostAppStateRead.tier(), PermissionTier::Transparent);
        assert_eq!(Permission::HostThemeRead.tier(), PermissionTier::Transparent);
        assert_eq!(Permission::HostNavigation.tier(), PermissionTier::Standard);
        assert_eq!(Permission::HostFileDialogs.tier(), PermissionTier::Standard);
        assert_eq!(Permission::HostFileWatch.tier(), PermissionTier::Standard);
        assert_eq!(Permission::HostAIChatAccess.tier(), PermissionTier::Standard);
        assert_eq!(
            Permission::HostEnterpriseGatewayAccess.tier(),
            PermissionTier::Standard,
        );
    }

    #[test]
    fn host_aichat_access_serializes_with_canonical_name() {
        assert_eq!(
            serde_json::to_value(Permission::HostAIChatAccess).unwrap(),
            json!({ "type": HOST_AICHAT_ACCESS_PERMISSION })
        );
    }

    #[test]
    fn host_aichat_access_deserializes_only_from_canonical_name() {
        let parsed: Permission =
            serde_json::from_value(json!({ "type": HOST_AICHAT_ACCESS_PERMISSION })).unwrap();
        assert_eq!(parsed, Permission::HostAIChatAccess);

        let error = serde_json::from_value::<Permission>(
            json!({ "type": INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION }),
        )
        .unwrap_err()
        .to_string();
        assert!(error.contains(HOST_AICHAT_ACCESS_PERMISSION));
    }

    #[test]
    fn permission_validator_rejects_legacy_host_a_i_chat_name() {
        let error = validate_manifest_permissions_json(&json!([
            { "type": INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION }
        ]))
        .unwrap_err();
        assert!(error.contains(INVALID_HOST_A_I_CHAT_ACCESS_PERMISSION));
        assert!(error.contains(HOST_AICHAT_ACCESS_PERMISSION));
    }

    #[test]
    fn validates_enterprise_gateway_host_permission() {
        validate_manifest_permission_json(&json!({
            "type": HOST_ENTERPRISE_GATEWAY_ACCESS_PERMISSION
        }))
        .expect("host enterprise gateway permission should be valid");
    }

    #[test]
    fn validates_deep_links_host_permission() {
        validate_manifest_permission_json(&json!({
            "type": "host_deep_links"
        }))
        .expect("host deep links permission should be valid");
    }

    #[test]
    fn validates_file_watch_host_permission() {
        validate_manifest_permission_json(&json!({
            "type": "host_file_watch"
        }))
        .expect("host file watch permission should be valid");
    }
}
