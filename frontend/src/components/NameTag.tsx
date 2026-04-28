import { useState, useRef, useEffect } from "react";

interface NameTagProps {
  name: string;
  color: string;
  onNameChange: (name: string) => void;
}

export function NameTag({ name, color, onNameChange }: NameTagProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      onNameChange(trimmed);
    } else {
      setDraft(name);
    }
    setEditing(false);
  }

  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(4px)",
        borderRadius: 8,
        padding: "4px 10px",
        fontSize: 13,
        fontFamily: "system-ui, sans-serif",
        boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
        cursor: editing ? "default" : "pointer",
        userSelect: "none",
      }}
      onClick={() => {
        if (!editing) {
          setDraft(name);
          setEditing(true);
        }
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
        }}
      />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(name);
              setEditing(false);
            }
          }}
          onBlur={commit}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontSize: 13,
            fontFamily: "inherit",
            width: 120,
            padding: 0,
          }}
          maxLength={24}
        />
      ) : (
        <span>{name}</span>
      )}
    </div>
  );
}
