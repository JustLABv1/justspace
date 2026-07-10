'use client';

import { Button, Dropdown, Label } from "@heroui/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function ThemeSwitcher({ menuItem = false }: { menuItem?: boolean }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const { theme, setTheme } = useTheme();

  if (!isClient) return null;

  const switchTheme = () => setTheme(theme === "light" ? "dark" : "light");
  const targetTheme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? Moon : Sun;

  if (menuItem) {
    return (
      <Dropdown.Item id="theme" textValue={`Switch to ${targetTheme} theme`} onAction={switchTheme}>
        <div className="flex items-center gap-2">
          <Icon size={14} />
          <Label className="cursor-pointer text-[13px]">Switch to {targetTheme} theme</Label>
        </div>
      </Dropdown.Item>
    );
  }

  return (
    <Button
      variant="ghost"
      isIconOnly
      onPress={switchTheme}
      aria-label={`Switch to ${targetTheme} theme`}
      className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-tertiary transition-colors"
    >
      <Icon size={15} />
    </Button>
  );
}
