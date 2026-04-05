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

    /// Read app config (theme, language).
    AppConfigRead,
}

impl Permission {
    /// Approval tier for this permission.
    pub fn tier(&self) -> PermissionTier {
        match self {
            Self::UiInject
            | Self::EventsListen
            | Self::DatabaseCreateTables
            | Self::AppConfigRead
            | Self::Notifications => PermissionTier::Transparent,

            Self::DatabaseReadAll
            | Self::DatabaseRead(_)
            | Self::IpcRegister
            | Self::EventsEmit
            | Self::NetworkHttpDomain(_) => PermissionTier::Standard,

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
            Self::AppConfigRead             => "Read app configuration".into(),
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
