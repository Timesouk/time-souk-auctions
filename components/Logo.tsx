import Image from "next/image";
import logo from "@/public/brand/logo.png";

/** The Time Souk logo (THE / TIME / SOUK in yellow, cyan and red). Without `height`, the CSS sets the size. */
export function Logo({ height, priority }: { height?: number; priority?: boolean }) {
  const h = height ?? 52;
  const width = Math.round((h * logo.width) / logo.height);
  return (
    <Image
      className="logo"
      src={logo}
      alt="The Time Souk"
      width={width}
      height={h}
      priority={priority}
      style={height ? { height, width: "auto" } : undefined}
    />
  );
}
