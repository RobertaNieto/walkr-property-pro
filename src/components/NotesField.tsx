import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface NotesFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

// Lightweight Web Speech API hook
type SpeechRecognitionLike = {
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

export function NotesField({ value, onChange, placeholder = "Optional notes…" }: NotesFieldProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (Ctor) setSupported(true);
  }, []);

  const toggle = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    if (listening) {
      recRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let chunk = "";
      for (let i = 0; i < e.results.length; i++) {
        chunk += e.results[i][0].transcript;
      }
      onChange((value ? value + " " : "") + chunk.trim());
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  return (
    <div className="relative">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full resize-none rounded-2xl border border-input bg-card px-4 py-3 pr-14 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
      {supported && (
        <button
          type="button"
          onClick={toggle}
          aria-label={listening ? "Stop dictation" : "Start dictation"}
          className={cn(
            "absolute right-2 top-2 inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors",
            listening
              ? "animate-pulse bg-critical text-critical-foreground"
              : "bg-secondary text-foreground hover:bg-accent hover:text-accent-foreground"
          )}
        >
          {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>
      )}
    </div>
  );
}
