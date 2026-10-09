"use client";

import Box from "@cloudscape-design/components/box";
import Modal from "@cloudscape-design/components/modal";

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "/", action: "Focus the filter on this page" },
  { keys: "c", action: "Create a hosted zone, or a record on a zone page" },
  { keys: "g then h", action: "Go to hosted zones" },
  { keys: "?", action: "Show these shortcuts" },
  { keys: "Esc", action: "Close this dialog" },
  { keys: "Alt+S", action: "Focus the console search field" },
];

interface ShortcutsModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function ShortcutsModal({ visible, onDismiss }: ShortcutsModalProps) {
  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      header="Keyboard shortcuts"
      closeAriaLabel="Close"
      data-testid="shortcuts-modal"
    >
      <Box variant="p">
        Shortcuts are ignored while you are typing in a field or another dialog is open.
      </Box>
      <ul>
        {SHORTCUTS.map((item) => (
          <li key={item.keys}>
            <strong>{item.keys}</strong>
            {` — ${item.action}`}
          </li>
        ))}
      </ul>
    </Modal>
  );
}
