"use client";

import {
  Users,
  School,
  BookOpen,
  ClipboardCheck,
  Target,
  Award,
} from "lucide-react";
import { StaggerChildren, StaggerItem } from "@/components/motion/StaggerChildren";
import { StatCard } from "./StatCard";

const STAT_ICONS = {
  users: Users,
  school: School,
  "book-open": BookOpen,
  "clipboard-check": ClipboardCheck,
  target: Target,
  award: Award,
} as const;

export type StatIconName = keyof typeof STAT_ICONS;

type StatItem = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: StatIconName;
  color?: "primary" | "success" | "warning" | "info" | "danger";
  onClick?: () => void;
  clickHint?: string;
};

export function StatCardGrid({
  items,
  columns = "sm:grid-cols-2 lg:grid-cols-4",
}: {
  items: StatItem[];
  columns?: string;
}) {
  return (
    <StaggerChildren className={`grid gap-5 ${columns}`}>
      {items.map((item) => {
        const Icon = STAT_ICONS[item.icon];
        return (
          <StaggerItem key={item.title} className="min-w-0">
            <StatCard {...item} icon={Icon} />
          </StaggerItem>
        );
      })}
    </StaggerChildren>
  );
}
