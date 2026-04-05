use thiserror::Error;

#[derive(Debug, Error, serde::Serialize, serde::Deserialize)]
pub enum PluginError {
    #[error("Permission denied: {0}")]
    PermissionDenied(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Serialization error: {0}")]
    Serialization(String),

    #[error("Plugin initialization failed: {0}")]
    InitFailed(String),

    #[error("Unsupported operation: {0}")]
    Unsupported(String),

    #[error("Process error: {0}")]
    Process(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("{0}")]
    Custom(String),
}

impl From<std::io::Error> for PluginError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e.to_string())
    }
}
