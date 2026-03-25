'use client';

import { Button } from "@heroui/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

export function ThemeSwitcher() {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  );
  const { theme, setTheme } = useTheme();

  if (!isClient) return null;

  return (
    <Button
      variant="ghost"
      isIconOnly
      onPress={() => setTheme(theme === "light" ? "dark" : "light")}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
      className="h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-tertiary transition-colors"
    >
      {theme === "light" ? (
        <Moon size={15} />
      ) : (
        <Sun size={15} />
      )}
    </Button>
  );
}
