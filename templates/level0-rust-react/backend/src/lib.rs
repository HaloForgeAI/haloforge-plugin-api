use haloforge_plugin_api::*;

pub struct TemplatePlugin;

impl TemplatePlugin {
    pub fn new() -> Self {
        Self
    }
}

impl HaloForgePlugin for TemplatePlugin {
    fn metadata(&self) -> PluginMetadata {
        PluginMetadata {
            id: "dev.example.template".into(),
            name: "Template Plugin".into(),
            version: "0.1.0".into(),
            description: "A HaloForge Level 0 plugin template.".into(),
            author: "Example".into(),
            abi_version: PLUGIN_ABI_VERSION,
        }
    }

    fn on_load(
        &mut self,
        _ctx: &dyn PluginContext,
        ipc: &mut dyn IpcRegistrar,
    ) -> Result<(), PluginError> {
        ipc.register("template_ping", Box::new(|args, _ctx| {
            Ok(serde_json::json!({
                "ok": true,
                "message": "Template backend is ready.",
                "echo": args
            }))
        }))?;
        Ok(())
    }

    fn on_unload(&mut self) -> Result<(), PluginError> {
        Ok(())
    }
}

declare_plugin!(TemplatePlugin, TemplatePlugin::new);
