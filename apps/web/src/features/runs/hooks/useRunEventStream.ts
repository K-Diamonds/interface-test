import { useEffect, useRef, useState } from "react";
import { JobStatus, StreamConnectionState } from "@cu/contracts";
import { apiEventStreamUrl } from "@/services/api/client";

export type StreamStatus = StreamConnectionState;

/**
 * SSE consumer for live discovery/replay job events.
 * Uses configurable API base; bounded reconnect; stops on terminal run.
 */
export function useRunEventStream(runId: string | undefined) {
  const [events, setEvents] = useState<unknown[]>([]);
  const [status, setStatus] = useState<StreamStatus>(
    StreamConnectionState.Connecting,
  );
  const attempt = useRef(0);
  const ended = useRef(false);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    ended.current = false;
    attempt.current = 0;

    const connect = () => {
      if (cancelled || ended.current) return;
      setStatus(
        attempt.current === 0
          ? StreamConnectionState.Connecting
          : StreamConnectionState.Reconnecting,
      );
      source = new EventSource(
        apiEventStreamUrl(`/api/runs/${encodeURIComponent(runId)}/stream`),
      );
      source.onopen = () => {
        attempt.current = 0;
        setStatus(StreamConnectionState.Connected);
      };
      source.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data) as {
            type?: string;
            status?: JobStatus;
          };
          setEvents((prev) => [...prev, data]);
          if (
            data.type === "job.status" &&
            (data.status === JobStatus.Completed ||
              data.status === JobStatus.Failed)
          ) {
            ended.current = true;
            setStatus(StreamConnectionState.Ended);
            source?.close();
          }
        } catch {
          // ignore malformed frames
        }
      };
      source.onerror = () => {
        source?.close();
        if (cancelled || ended.current) return;
        setStatus(StreamConnectionState.Reconnecting);
        attempt.current += 1;
        if (attempt.current > 8) {
          setStatus(StreamConnectionState.Disconnected);
          return;
        }
        const delay = Math.min(8_000, 500 * 2 ** (attempt.current - 1));
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      source?.close();
    };
  }, [runId]);

  return { events, status };
}
