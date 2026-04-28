import { useEffect, useRef } from "react";
import { Editor, HistoryEntry, TLRecord } from "tldraw";
import { InstancePresenceRecordType } from "@tldraw/tlschema";

interface SnapshotMessage {
  type: "snapshot";
  records: Record<string, TLRecord>;
}

interface ChangesMessage {
  type: "changes";
  changes: {
    added: Record<string, TLRecord>;
    updated: Record<string, [TLRecord, TLRecord]>;
    removed: Record<string, TLRecord>;
  };
}

interface PresenceMessage {
  type: "presence";
  userId: string;
  presence: TLRecord;
}

interface PeerPresencesMessage {
  type: "peer_presences";
  presences: Record<string, TLRecord>;
}

interface LeaveMessage {
  type: "leave";
  userId: string;
}

type ServerMessage =
  | SnapshotMessage
  | ChangesMessage
  | PresenceMessage
  | PeerPresencesMessage
  | LeaveMessage;

export interface UserInfo {
  userId: string;
  userName: string;
  color: string;
}

const IDLE_TIMEOUT = 15_000;
const PRESENCE_INTERVAL = 100;

export function useMultiplayerSync(
  roomId: string,
  editor: Editor | null,
  userInfo: UserInfo
) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userInfoRef = useRef(userInfo);
  userInfoRef.current = userInfo;

  useEffect(() => {
    if (!editor || !roomId) return;

    const ed = editor;
    let disposed = false;
    let lastActivityTime = Date.now();
    let lastSentCursorX = NaN;
    let lastSentCursorY = NaN;
    let lastSentPageId = "";
    let lastSentIdle = false;
    let lastSentName = "";

    // Track user activity for idle detection
    const handleEvent = () => {
      lastActivityTime = Date.now();
    };
    ed.on("event", handleEvent);

    // Presence sending interval
    const presenceTimer = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const info = userInfoRef.current;
      const cursor = ed.inputs.currentPagePoint;
      const pageId = ed.getCurrentPageId();
      const isIdle = Date.now() - lastActivityTime > IDLE_TIMEOUT;
      const displayName = isIdle ? `${info.userName} (idle)` : info.userName;

      // Delta check — skip if nothing changed
      if (
        cursor.x === lastSentCursorX &&
        cursor.y === lastSentCursorY &&
        pageId === lastSentPageId &&
        isIdle === lastSentIdle &&
        info.userName === lastSentName
      ) {
        return;
      }
      lastSentCursorX = cursor.x;
      lastSentCursorY = cursor.y;
      lastSentPageId = pageId;
      lastSentIdle = isIdle;
      lastSentName = info.userName;

      const camera = ed.getCamera();
      const selectedShapeIds = ed.getSelectedShapeIds();
      const screenBounds = ed.getViewportScreenBounds();

      const presence = InstancePresenceRecordType.create({
        id: InstancePresenceRecordType.createId(info.userId),
        userId: info.userId,
        userName: displayName,
        color: info.color,
        currentPageId: pageId,
        cursor: {
          x: cursor.x,
          y: cursor.y,
          type: "default",
          rotation: 0,
        },
        camera: { x: camera.x, y: camera.y, z: camera.z },
        lastActivityTimestamp: lastActivityTime,
        selectedShapeIds: [...selectedShapeIds],
        screenBounds: {
          x: screenBounds.x,
          y: screenBounds.y,
          w: screenBounds.w,
          h: screenBounds.h,
        },
      });

      ws.send(
        JSON.stringify({
          type: "presence",
          userId: info.userId,
          presence,
        })
      );
    }, PRESENCE_INTERVAL);

    function connect() {
      if (disposed) return;

      const protocol =
        window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/ws/${roomId}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[sync] connected to room ${roomId}`);
        // Reset delta tracking so presence is sent immediately on reconnect
        lastSentCursorX = NaN;
      };

      ws.onmessage = (event) => {
        const data: ServerMessage = JSON.parse(event.data);

        if (data.type === "presence") {
          ed.store.mergeRemoteChanges(() => {
            ed.store.put([data.presence as TLRecord]);
          });
          return;
        }

        if (data.type === "peer_presences") {
          ed.store.mergeRemoteChanges(() => {
            const records = Object.values(data.presences) as TLRecord[];
            if (records.length > 0) {
              ed.store.put(records);
            }
          });
          return;
        }

        if (data.type === "leave") {
          const id = InstancePresenceRecordType.createId(
            data.userId
          ) as TLRecord["id"];
          ed.store.mergeRemoteChanges(() => {
            ed.store.remove([id]);
          });
          return;
        }

        // Document sync messages
        ed.store.mergeRemoteChanges(() => {
          if (data.type === "snapshot") {
            const records = Object.values(data.records);
            if (records.length > 0) {
              ed.store.put(records);
            }
          } else if (data.type === "changes") {
            const { added, updated, removed } = data.changes;

            const toPut: TLRecord[] = [];

            if (added) {
              toPut.push(...Object.values(added));
            }
            if (updated) {
              for (const [, pair] of Object.entries(updated)) {
                toPut.push(pair[1]);
              }
            }

            if (toPut.length > 0) {
              ed.store.put(toPut);
            }

            if (removed) {
              const ids = Object.keys(removed) as TLRecord["id"][];
              if (ids.length > 0) {
                ed.store.remove(ids);
              }
            }
          }
        });
      };

      ws.onclose = () => {
        console.log("[sync] disconnected, reconnecting in 1s...");
        if (!disposed) {
          reconnectTimer.current = setTimeout(connect, 1000);
        }
      };

      ws.onerror = (err) => {
        console.error("[sync] websocket error", err);
        ws.close();
      };
    }

    // Listen to local user changes and send them to the server
    const unsubscribe = ed.store.listen(
      (entry: HistoryEntry<TLRecord>) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        const msg: ChangesMessage = {
          type: "changes",
          changes: entry.changes,
        };
        ws.send(JSON.stringify(msg));
      },
      { source: "user", scope: "document" }
    );

    connect();

    return () => {
      disposed = true;
      clearInterval(presenceTimer);
      ed.off("event", handleEvent);
      unsubscribe();
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [editor, roomId]);
}
