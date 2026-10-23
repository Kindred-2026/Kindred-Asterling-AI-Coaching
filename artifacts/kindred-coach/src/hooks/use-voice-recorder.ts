import { useCallback, useEffect, useRef, useState } from "react";
import { transcribeAudio, VoiceError } from "@/lib/voice-api";

export type RecorderStatus = "idle" | "recording" | "transcribing";

// MediaRecorder-based dictation. Unlike the browser SpeechRecognition API
// (unsupported on many mobile browsers, e.g. Brave on Android), this records
// audio locally and sends it to the server for transcription, so it works
// everywhere getUserMedia + MediaRecorder are available.
export function useVoiceRecorder(onText: (text: string) => void) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  // True while waiting on getUserMedia (the permission prompt), so a second
  // tap can't open a second stream that nothing would ever stop.
  const startingRef = useRef(false);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function" &&
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined";

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  const start = useCallback(async () => {
    if (!supported) {
      setError("Voice input isn't supported on this device.");
      return;
    }
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        // Unmounted during the permission prompt: the unmount cleanup already
        // ran, so release the mic here.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        cleanupStream();
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        if (blob.size === 0) {
          setStatus("idle");
          return;
        }
        setStatus("transcribing");
        const controller = new AbortController();
        abortRef.current = controller;
        try {
          const text = await transcribeAudio(blob, controller.signal);
          if (!mountedRef.current || controller.signal.aborted) return;
          if (text) onText(text);
          else setError("Didn't catch that — try speaking a little longer.");
        } catch (err) {
          if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
          if (!mountedRef.current) return;
          setError(
            err instanceof VoiceError
              ? err.message
              : "Couldn't transcribe that. Try again.",
          );
        } finally {
          abortRef.current = null;
          if (mountedRef.current) setStatus("idle");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");
    } catch (err) {
      cleanupStream();
      const name = (err as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Microphone access was blocked. Enable it in your browser settings.");
      } else if (name === "NotFoundError") {
        setError("No microphone was found on this device.");
      } else {
        setError("Couldn't start recording. Try again.");
      }
      setStatus("idle");
    } finally {
      startingRef.current = false;
    }
  }, [supported, cleanupStream, onText]);

  const stop = useCallback(() => {
    if (recorderRef.current && status === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        cleanupStream();
        setStatus("idle");
      }
    }
  }, [status, cleanupStream]);

  const toggle = useCallback(() => {
    if (status === "recording") stop();
    else if (status === "idle") void start();
  }, [status, start, stop]);

  return { status, error, setError, supported, start, stop, toggle };
}
