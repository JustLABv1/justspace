'use client';

import { Button } from "@heroui/react";
import { Moon, Sun } from "@solar-icons/react";
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
      className="h-11 w-11 rounded-2xl bg-foreground/5 text-muted-foreground hover:text-accent hover:bg-foreground/10 border border-border/20 transition-all shadow-inner group"
    >
      {theme === "light" ? (
        <Moon size={22} weight="Bold" className="group-hover:scale-110 transition-transform" />
      ) : (
        <Sun size={22} weight="Bold" className="group-hover:scale-110 transition-transform" />
      )}
    </Button>
  );
}
