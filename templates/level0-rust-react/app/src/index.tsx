import { definePlugin, registerPlugin } from "@haloforge/plugin-sdk";
import { TemplatePanel } from "./Panel";
import "./styles.css";

export default registerPlugin("dev.example.template", definePlugin({
  panel: TemplatePanel,
}));
