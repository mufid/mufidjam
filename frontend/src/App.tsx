import { useState, useCallback } from "react";
import { Tldraw, Editor } from "tldraw";
import "tldraw/tldraw.css";
import { useMultiplayerSync } from "./hooks/useMultiplayerSync";
import { NameTag } from "./components/NameTag";

// --- User identity (persisted in localStorage) ---

const ADJECTIVES = [
  "Swift", "Brave", "Calm", "Eager", "Fancy",
  "Gentle", "Happy", "Jolly", "Kind", "Lively",
  "Merry", "Noble", "Proud", "Quick", "Sunny",
];

const ANIMALS = [
  "Otter", "Fox", "Owl", "Bear", "Deer",
  "Wolf", "Hawk", "Lynx", "Hare", "Seal",
  "Crane", "Finch", "Koala", "Panda", "Robin",
];

const COLORS = [
  "#e03131", "#2f9e44", "#1971c2", "#f08c00",
  "#9c36b5", "#0c8599", "#e8590c", "#6741d9",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getOrCreateUserInfo() {
  const stored = localStorage.getItem("user-info");
  if (stored) {
    try {
      return JSON.parse(stored) as { userId: string; userName: string; color: string };
    } catch {
      // fall through to create new
    }
  }
  const info = {
    userId: crypto.randomUUID(),
    userName: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`,
    color: pick(COLORS),
  };
  localStorage.setItem("user-info", JSON.stringify(info));
  return info;
}

const initialUserInfo = getOrCreateUserInfo();

// --- App ---

function getRoomId(): string {
  const path = window.location.pathname;
  const match = path.match(/^\/room\/(.+)$/);
  if (match) return match[1];

  const randomId = Math.random().toString(36).substring(2, 10);
  window.location.href = `/room/${randomId}`;
  return randomId;
}

export default function App() {
  const roomId = getRoomId();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [userName, setUserName] = useState(initialUserInfo.userName);

  const userInfo = { ...initialUserInfo, userName };

  useMultiplayerSync(roomId, editor, userInfo);

  const handleMount = useCallback((editor: Editor) => {
    setEditor(editor);
  }, []);

  const handleNameChange = useCallback((newName: string) => {
    setUserName(newName);
    const stored = getOrCreateUserInfo();
    stored.userName = newName;
    localStorage.setItem("user-info", JSON.stringify(stored));
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      <Tldraw onMount={handleMount} />
      <NameTag
        name={userName}
        color={userInfo.color}
        onNameChange={handleNameChange}
      />
    </div>
  );
}
