'use client';

import { Button } from "@heroui/react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeSwitcher() {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Button
      variant="ghost"
      isIconOnly
      onPress={() => setTheme(theme === "light" ? "dark" : "light")}
      className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground hover:bg-surface-secondary transition-all"
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
    </Button>
  );
}
