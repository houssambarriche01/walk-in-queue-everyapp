import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** The join link as a QR code, drawn in the browser. */
export function QrCode({
  value,
  size = 176,
}: {
  value: string;
  size?: number;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((out) => live && setSvg(out))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      data-testid="qr-code"
      role="img"
      aria-label="QR code for the join link"
      className="shrink-0 overflow-hidden rounded-lg border border-border [&>svg]:size-full"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
