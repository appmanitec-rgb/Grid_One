"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";

type SessionHeartbeatProps = {
  source: "DASHBOARD" | "CLIENT_PORTAL";
};

function createSessionId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function SessionHeartbeat({ source }: SessionHeartbeatProps) {
  const pathname = usePathname();

  useEffect(() => {
    const storageKey = "manitec_session_activity_id";
    let sessionId = window.sessionStorage.getItem(storageKey);
    if (!sessionId) {
      sessionId = createSessionId();
      window.sessionStorage.setItem(storageKey, sessionId);
    }
    const activeSessionId = sessionId;

    const ping = () => {
      void apiFetch("/studio/utilization/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: activeSessionId,
          currentPath: pathname,
          source,
          visible: document.visibilityState === "visible",
        }),
      }).catch(() => undefined);
    };

    ping();
    const intervalId = window.setInterval(ping, 60_000);
    window.addEventListener("focus", ping);
    document.addEventListener("visibilitychange", ping);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", ping);
      document.removeEventListener("visibilitychange", ping);
    };
  }, [pathname, source]);

  return null;
}
