'use client';

import { Button, ButtonGroup } from "@heroui/react";
import { AltArrowLeft as ChevronLeft, AltArrowRight as ChevronRight } from "@solar-icons/react";

export interface PaginationProps {
  total: number;
  page: number;
  initialPage?: number;
  onChange: (page: number) => void;
  color?: "primary" | "secondary" | "success" | "warning" | "danger" | "default" | "accent";
  variant?: "secondary" | "tertiary" | "outline" | "ghost" | "danger" | "danger-soft";
  size?: "sm" | "md" | "lg";
  classNames?: {
    cursor?: string;
    item?: string;
    prev?: string;
    next?: string;
  };
}

export const Pagination = ({ 
    total, 
    page, 
    onChange, 
    color = "primary", 
    variant,
    size = "md",
    classNames
}: PaginationProps) => {
  const pages = Array.from({ length: total }, (_, i) => i + 1);

  // Simple range logic for better UX if many pages
  const renderPages = () => {
    if (total <= 7) return pages;
    
    if (page <= 3) return [...pages.slice(0, 5), '...', total];
    if (page >= total - 2) return [1, '...', ...pages.slice(total - 5)];
    
    return [1, '...', page - 1, page, page + 1, '...', total];
  };

  const getButtonVariant = (p: number | string) => {
    if (p === page) return undefined; // primary
    return variant || "secondary";
  };

  const getButtonClassName = (p: number | string) => {
    let base = `${classNames?.item || ''}`;
    if (p === page) {
      base += ` ${classNames?.cursor || ''} ${color === 'accent' ? 'bg-accent text-white shadow-xl shadow-accent/20' : ''}`;
    }
    return base;
  };

  return (
    <div className="flex items-center gap-2">
      <ButtonGroup variant={variant || "secondary"} size={size}>
        <Button
          isDisabled={page <= 1}
          onPress={() => onChange(page - 1)}
          className={classNames?.prev}
          isIconOnly
        >
          <ChevronLeft size={16} />
        </Button>
        
        {renderPages().map((p, i) => (
          p === '...' ? (
            <Button key={`ellipsis-${i}`} isDisabled variant="ghost" className="min-w-8">...</Button>
          ) : (
            <Button
              key={p}
              variant={getButtonVariant(p)}
              onPress={() => onChange(p as number)}
              className={getButtonClassName(p)}
            >
              {p}
            </Button>
          )
        ))}

        <Button
          isDisabled={page >= total}
          onPress={() => onChange(page + 1)}
          className={classNames?.next}
          isIconOnly
        >
          <ChevronRight size={16} />
        </Button>
      </ButtonGroup>
    </div>
  );
};
