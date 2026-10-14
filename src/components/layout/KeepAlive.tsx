"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";

const MAX_CACHED = 5;

export function KeepAlive({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const cacheRef = useRef<Map<string, React.ReactNode>>(new Map());
  const orderRef = useRef<string[]>([]);

  cacheRef.current.set(pathname, children);

  if (!orderRef.current.includes(pathname)) {
    orderRef.current.push(pathname);
  } else {
    orderRef.current = orderRef.current.filter((p) => p !== pathname);
    orderRef.current.push(pathname);
  }

  while (orderRef.current.length > MAX_CACHED) {
    const oldest = orderRef.current.shift();
    if (oldest && oldest !== pathname) {
      cacheRef.current.delete(oldest);
    }
  }

  return (
    <>
      {Array.from(cacheRef.current.entries()).map(([path, node]) => {
        const isActive = path === pathname;
        return (
          <div
            key={path}
            className={isActive ? undefined : "hidden"}
            aria-hidden={!isActive}
          >
            {node}
          </div>
        );
      })}
    </>
  );
}
