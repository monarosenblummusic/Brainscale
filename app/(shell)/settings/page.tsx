import type { Metadata } from "next";
import { SettingsView } from "@/components/settings-view";

export const metadata: Metadata = {
  title: "Settings",
  description: "Theme, data export and reset.",
};

export default function Page() {
  return <SettingsView />;
}
