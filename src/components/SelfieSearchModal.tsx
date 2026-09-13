import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, ScanFace, Upload, X } from "lucide-react";
import { descriptorFromSelfie, loadFaceApi } from "@/lib/face";
import { searchFaces } from "@/lib/matches";

interface SelfieSearchModalProps {
  matchId: string;
  onClose: () => void;
  onResults: (photoIds: string[]) => void;
}

type Stage = "idle" | "camera" | "working";

export function SelfieSearchModal({
  matchId,
  onClose,
  onResults,
}: SelfieSearchModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 720, height: 720 },
        audio: false,
      });
      streamRef.current = stream;
      setStage("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError(
        "No pudimos abrir la cámara. Revisa los permisos o sube una foto desde tus archivos.",
      );
    }
  };

  const runSearch = async (blob: Blob) => {
    setStage("working");
    setError(null);
    try {
      setStatusText("Preparando el reconocimiento de rostros…");
      await loadFaceApi();
      setStatusText("Analizando rostro y buscando coincidencias…");
      const descriptor = await descriptorFromSelfie(blob);
      if (!descriptor) {
        setError(
          "No detectamos ningún rostro. Prueba con buena luz y la cara centrada.",
        );
        setStage("idle");
        return;
      }
      const matches = await searchFaces(descriptor, matchId);
      onResults(matches.map((m) => m.photo_id));
      stopCamera();
      onClose();
    } catch {
      setError("Algo salió mal durante la búsqueda. Inténtalo de nuevo.");
      setStage("idle");
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9),
    );
    stopCamera();
    if (blob) await runSearch(blob);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={() => {
        if (stage !== "working") {
          stopCamera();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar mis fotos con selfie"
        className="frost w-full max-w-md rounded-t-3xl border border-border p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide">
            <ScanFace className="size-5 text-turf" /> Buscar con selfie
          </h3>
          <button
            type="button"
            aria-label="Cerrar"
            disabled={stage === "working"}
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </div>

        {stage === "working" ? (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto size-8 animate-spin text-turf" />
            <p className="mt-4 text-sm text-muted-foreground">{statusText}</p>
          </div>
        ) : stage === "camera" ? (
          <div className="mt-4">
            <div className="overflow-hidden rounded-2xl border border-turf/30 bg-black">
              <video
                ref={videoRef}
                playsInline
                muted
                className="aspect-square w-full scale-x-[-1] object-cover"
              />
            </div>
            <button
              type="button"
              onClick={capture}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-turf py-3 font-display text-sm font-semibold uppercase tracking-wide text-background active:scale-95"
            >
              <Camera className="size-4" /> Tomar foto
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Tómate un selfie o sube una foto tuya y te mostramos solo las
              imágenes del partido en las que apareces.
            </p>
            <button
              type="button"
              onClick={startCamera}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-turf py-3 font-display text-sm font-semibold uppercase tracking-wide text-background active:scale-95"
            >
              <Camera className="size-4" /> Usar la cámara
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-turf/40 bg-turf/10 py-3 font-display text-sm font-semibold uppercase tracking-wide text-turf active:scale-95"
            >
              <Upload className="size-4" /> Subir una foto
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void runSearch(file);
              }}
            />
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
