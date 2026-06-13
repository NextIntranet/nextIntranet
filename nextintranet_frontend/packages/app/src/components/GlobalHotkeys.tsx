import { useNavigate } from "react-router-dom"

import { useHotkeys, useHotkeysHelp } from "@/lib/hotkeys"

/** Registers app-wide shortcuts; mounted once inside the Layout. */
export function GlobalHotkeys() {
  const navigate = useNavigate()
  const { setHelpOpen } = useHotkeysHelp()

  useHotkeys([
    {
      keys: "?",
      description: "Show keyboard shortcuts",
      group: "Global",
      handler: () => setHelpOpen(true),
    },
    {
      keys: "ctrl+/",
      description: "Show keyboard shortcuts",
      group: "Global",
      handler: () => setHelpOpen(true),
      allowInInput: true,
    },
    {
      keys: "g h",
      description: "Go to dashboard",
      group: "Global",
      handler: () => navigate("/"),
    },
    {
      keys: "g c",
      description: "Go to catalog",
      group: "Global",
      handler: () => navigate("/store"),
    },
    {
      keys: "g i",
      description: "Go to Do inventory",
      group: "Global",
      handler: () => navigate("/store/inventory"),
    },
    {
      keys: "g p",
      description: "Go to packet list",
      group: "Global",
      handler: () => navigate("/store/inventory/packets"),
    },
    {
      keys: "g s",
      description: "Go to packet status",
      group: "Global",
      handler: () => navigate("/store/inventory/status"),
    },
    {
      keys: "g l",
      description: "Go to locations",
      group: "Global",
      handler: () => navigate("/store/location"),
    },
    {
      keys: "g q",
      description: "Go to print queue",
      group: "Global",
      handler: () => navigate("/print/queue"),
    },
  ])

  return null
}
