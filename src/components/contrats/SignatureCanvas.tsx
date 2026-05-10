/**
 * Tour 2 — Wrapper signature canvas (mobile + desktop friendly).
 * Retourne le PNG en data-URL via getDataUrl().
 */
import { useRef, useImperativeHandle, forwardRef, useState } from "react";
import SignaturePad from "react-signature-canvas";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignatureCanvasHandle {
  getDataUrl: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface Props {
  width?: number;
  height?: number;
  className?: string;
  onChange?: (empty: boolean) => void;
}

export const SignatureCanvas = forwardRef<SignatureCanvasHandle, Props>(function SignatureCanvas(
  { width = 500, height = 180, className, onChange },
  ref,
) {
  const padRef = useRef<SignaturePad>(null);
  const [empty, setEmpty] = useState(true);

  useImperativeHandle(ref, () => ({
    getDataUrl: () => {
      const hasPad = !!padRef.current;
      const isEmpty = padRef.current?.isEmpty() ?? true;
      console.log("[contrat-signature][canvas.getDataUrl]", { hasPad, isEmpty });
      if (!padRef.current || isEmpty) return null;
      const dataUrl = padRef.current.getCanvas().toDataURL("image/png");
      console.log("[contrat-signature][canvas.getDataUrl:ok]", { length: dataUrl.length, prefix: dataUrl.slice(0, 32) });
      return dataUrl;
    },
    clear: () => {
      console.log("[contrat-signature][canvas.clear]");
      padRef.current?.clear();
      setEmpty(true);
      onChange?.(true);
    },
    isEmpty: () => padRef.current?.isEmpty() ?? true,
  }));

  return (
    <div className={className}>
      <div className="rounded-lg border-2 border-dashed border-border bg-background overflow-hidden">
        <SignaturePad
          ref={padRef}
          canvasProps={{
            width,
            height,
            className: "block w-full touch-none",
            style: { width: "100%", height, maxWidth: width },
          }}
          onEnd={() => {
            const isEmpty = padRef.current?.isEmpty() ?? true;
            console.log("[contrat-signature][canvas.onEnd]", { isEmpty });
            setEmpty(isEmpty);
            onChange?.(isEmpty);
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{empty ? "Signez dans le cadre ci-dessus" : "Signature capturée"}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            console.log("[contrat-signature][canvas.eraseClick]");
            padRef.current?.clear();
            setEmpty(true);
            onChange?.(true);
          }}
        >
          <Eraser className="h-3.5 w-3.5" />
          Effacer
        </Button>
      </div>
    </div>
  );
});
