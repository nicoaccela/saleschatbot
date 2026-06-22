import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { MODELS, modelLabel } from "../lib/models";

export default function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="picker" ref={ref}>
      <button className="picker-trigger" onClick={() => setOpen((o) => !o)}>
        <span className="dot" />
        {modelLabel(value)}
        <ChevronDown size={15} />
      </button>
      {open && (
        <div className="picker-menu">
          {MODELS.map((m) => (
            <div
              key={m.id}
              className={"picker-opt" + (m.id === value ? " selected" : "")}
              onClick={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              <div className="name">{m.label}</div>
              <div className="desc">{m.sub}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
